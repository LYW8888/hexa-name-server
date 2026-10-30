"""Offline, role-separated operational registers; no customer or payment data."""
from __future__ import annotations

import argparse
import json
import os
import pwd
import sqlite3
import stat
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ACCOUNTS = {'support': 'xuming-support', 'finance': 'xuming-finance'}
CATEGORIES = ('usage', 'naming', 'technical', 'other')
TRANSITIONS = {
    'open': ('in_progress', 'closed'),
    'in_progress': ('resolved', 'closed'),
    'resolved': ('in_progress', 'closed'),
    'closed': (),
}
KINDS = ('income', 'expense', 'refund')
MAX_AMOUNT = 1_000_000_000_00  # 1 billion CNY in fen per manual entry


def require_identity(role):
    if os.getuid() == 0 or os.geteuid() == 0:
        raise PermissionError('do not run as root; use the dedicated role account')
    if pwd.getpwuid(os.geteuid()).pw_name != ACCOUNTS[role]:
        raise PermissionError(f'{role} requires OS account {ACCOUNTS[role]}')


def secure_directory(directory):
    path = Path(directory)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise PermissionError('data directory must be a private directory owned by the role account (0700)')
    return path


def connect(role, directory):
    require_identity(role)
    path = secure_directory(directory) / f'{role}.sqlite3'
    os.umask(0o077)
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        os.close(fd)
    except FileExistsError:
        pass
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
        or stat.S_IMODE(info.st_mode) & 0o077 or info.st_nlink != 1):
        raise PermissionError('database must be a private regular file owned by the role account (0600)')
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS audit (
            id INTEGER PRIMARY KEY, at TEXT NOT NULL, action TEXT NOT NULL, object_id TEXT
        );
        CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
        CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
    ''')
    if role == 'support':
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS tickets (
                id TEXT PRIMARY KEY, category TEXT NOT NULL, status TEXT NOT NULL,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
        ''')
    else:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS entries (
                id TEXT PRIMARY KEY, kind TEXT NOT NULL, amount_fen INTEGER NOT NULL CHECK(amount_fen > 0),
                created_at TEXT NOT NULL, reverses TEXT UNIQUE REFERENCES entries(id)
            );
            CREATE TRIGGER IF NOT EXISTS entries_no_update BEFORE UPDATE ON entries BEGIN SELECT RAISE(ABORT, 'entries are append-only'); END;
            CREATE TRIGGER IF NOT EXISTS entries_no_delete BEFORE DELETE ON entries BEGIN SELECT RAISE(ABORT, 'entries are append-only'); END;
        ''')
    return conn


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def audit(conn, action, object_id=None):
    conn.execute('INSERT INTO audit(at,action,object_id) VALUES (?,?,?)', (now(), action, object_id))


def identifier(value):
    try:
        parsed = uuid.UUID(value)
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError('invalid identifier') from exc
    if str(parsed) != value:
        raise ValueError('invalid identifier')
    return value


def ticket_create(conn, category):
    if category not in CATEGORIES:
        raise ValueError('invalid category')
    ticket_id, timestamp = str(uuid.uuid4()), now()
    with conn:
        conn.execute('INSERT INTO tickets VALUES (?,?,?,?,?)', (ticket_id, category, 'open', timestamp, timestamp))
        audit(conn, 'ticket.create', ticket_id)
    return ticket_id


def ticket_move(conn, ticket_id, status):
    identifier(ticket_id)
    with conn:
        conn.execute('BEGIN IMMEDIATE')
        current = conn.execute('SELECT status FROM tickets WHERE id=?', (ticket_id,)).fetchone()
        if not current or status not in TRANSITIONS.get(current['status'], ()):
            raise ValueError('ticket does not exist or transition is not allowed')
        conn.execute('UPDATE tickets SET status=?,updated_at=? WHERE id=?', (status, now(), ticket_id))
        audit(conn, 'ticket.status.' + status, ticket_id)


def finance_record(conn, kind, amount):
    if kind not in KINDS or type(amount) is not int or not 0 < amount <= MAX_AMOUNT:
        raise ValueError('invalid kind or amount in fen')
    entry_id = str(uuid.uuid4())
    with conn:
        conn.execute('INSERT INTO entries VALUES (?,?,?,?,NULL)', (entry_id, kind, amount, now()))
        audit(conn, 'finance.record.' + kind, entry_id)
    return entry_id


def finance_reverse(conn, entry_id):
    identifier(entry_id)
    with conn:
        conn.execute('BEGIN IMMEDIATE')
        original = conn.execute('SELECT * FROM entries WHERE id=? AND reverses IS NULL', (entry_id,)).fetchone()
        if not original or conn.execute('SELECT 1 FROM entries WHERE reverses=?', (entry_id,)).fetchone():
            raise ValueError('entry does not exist or was already reversed')
        reversal_id = str(uuid.uuid4())
        conn.execute('INSERT INTO entries VALUES (?,?,?,?,?)', (reversal_id, original['kind'], original['amount_fen'], now(), entry_id))
        audit(conn, 'finance.reverse', reversal_id)
    return reversal_id


def list_records(conn, role):
    table = 'tickets' if role == 'support' else 'entries'
    with conn:
        rows = [dict(row) for row in conn.execute(f'SELECT * FROM {table} ORDER BY rowid DESC LIMIT 200')]
        audit(conn, role + '.list')
    return rows


def finance_summary(conn):
    with conn:
        totals = {kind: 0 for kind in KINDS}
        for row in conn.execute('SELECT kind, SUM(CASE WHEN reverses IS NULL THEN amount_fen ELSE -amount_fen END) AS total FROM entries GROUP BY kind'):
            totals[row['kind']] = row['total']
        audit(conn, 'finance.summary')
    return {'currency': 'CNY', 'amount_unit': 'fen', 'totals': totals,
            'net_recorded_fen': totals['income'] - totals['expense'] - totals['refund'],
            'note': 'Manual entries only; not payment, bank balance, reconciliation or accounting statements.'}


def support_summary(conn):
    with conn:
        totals = {status: 0 for status in TRANSITIONS}
        for row in conn.execute('SELECT status, COUNT(*) AS total FROM tickets GROUP BY status'):
            totals[row['status']] = row['total']
        audit(conn, 'support.summary')
    return {'counts': totals, 'note': 'Counts only; no customer details or conversation content.'}


def audit_history(conn, role):
    with conn:
        rows = [dict(row) for row in conn.execute('SELECT * FROM audit ORDER BY id DESC LIMIT 200')]
        audit(conn, role + '.audit.read')
    return rows


def parser():
    p = argparse.ArgumentParser(description='Role-isolated offline registers. Do not enter personal data.')
    p.add_argument('role', choices=ACCOUNTS)
    p.add_argument('action', choices=('init', 'create', 'move', 'record', 'reverse', 'list', 'summary', 'audit'))
    p.add_argument('--directory', help='Private role directory (default: /var/lib/xuming-ops/ROLE)')
    p.add_argument('--category', choices=CATEGORIES)
    p.add_argument('--status', choices=tuple(TRANSITIONS))
    p.add_argument('--id')
    p.add_argument('--kind', choices=KINDS)
    p.add_argument('--amount-fen', type=int)
    return p


def main(argv=None):
    args = parser().parse_args(argv)
    supported = {'support': {'init', 'create', 'move', 'list', 'summary', 'audit'}, 'finance': {'init', 'record', 'reverse', 'list', 'summary', 'audit'}}
    if args.action not in supported[args.role]:
        raise ValueError('action is not available for this role')
    conn = connect(args.role, args.directory or f'/var/lib/xuming-ops/{args.role}')
    try:
        if args.action == 'init':
            with conn: audit(conn, args.role + '.init')
            result = {'initialized': args.role}
        elif args.action == 'create': result = {'id': ticket_create(conn, args.category)}
        elif args.action == 'move': ticket_move(conn, args.id, args.status); result = {'updated': args.id, 'status': args.status}
        elif args.action == 'record': result = {'id': finance_record(conn, args.kind, args.amount_fen)}
        elif args.action == 'reverse': result = {'reversal_id': finance_reverse(conn, args.id)}
        elif args.action == 'list': result = list_records(conn, args.role)
        elif args.action == 'audit': result = audit_history(conn, args.role)
        else: result = support_summary(conn) if args.role == 'support' else finance_summary(conn)
        print(json.dumps(result, ensure_ascii=False))
    finally:
        conn.close()


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, sqlite3.Error) as exc:
        print(f'operation failed: {exc}', file=sys.stderr)
        sys.exit(1)
