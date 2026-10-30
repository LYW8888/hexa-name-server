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
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path

ACCOUNTS = {'support': 'xuming-support', 'finance': 'xuming-finance', 'delivery': 'xuming-delivery'}
CATEGORIES = ('usage', 'naming', 'technical', 'delivery', 'billing_exception', 'other')
TRANSITIONS = {
    'open': ('in_progress', 'closed'),
    'in_progress': ('resolved', 'closed'),
    'resolved': ('in_progress', 'closed'),
    'closed': (),
}
KINDS = ('income', 'expense')
MAX_ATTEMPTS = 3
LEASE_SECONDS = 600
MAX_AMOUNT = 1_000_000_000_00  # 1 billion CNY in fen per manual entry
AUDIT_ACTOR = ContextVar('audit_actor', default=None)


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
    if 'actor' not in {row['name'] for row in conn.execute('PRAGMA table_info(audit)')}:
        conn.execute('ALTER TABLE audit ADD COLUMN actor TEXT')
    if role == 'support':
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS tickets (
                id TEXT PRIMARY KEY, category TEXT NOT NULL, status TEXT NOT NULL,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
        ''')
        # Add an opaque service reference without storing or exposing its data.
        if 'service_id' not in {row['name'] for row in conn.execute('PRAGMA table_info(tickets)')}:
            conn.execute('ALTER TABLE tickets ADD COLUMN service_id TEXT')
    elif role == 'finance':
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS entries (
                id TEXT PRIMARY KEY, kind TEXT NOT NULL, amount_fen INTEGER NOT NULL CHECK(amount_fen > 0),
                created_at TEXT NOT NULL, reverses TEXT UNIQUE REFERENCES entries(id)
            );
            CREATE TRIGGER IF NOT EXISTS entries_no_update BEFORE UPDATE ON entries BEGIN SELECT RAISE(ABORT, 'entries are append-only'); END;
            CREATE TRIGGER IF NOT EXISTS entries_no_delete BEFORE DELETE ON entries BEGIN SELECT RAISE(ABORT, 'entries are append-only'); END;
        ''')
        if 'request_key' not in {row['name'] for row in conn.execute('PRAGMA table_info(entries)')}:
            conn.execute('ALTER TABLE entries ADD COLUMN request_key TEXT')
        conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS finance_request_key ON entries(request_key) WHERE request_key IS NOT NULL')
    else:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS services (
                id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, authorization_ref TEXT UNIQUE NOT NULL,
                spec_sha256 TEXT NOT NULL, offering TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('ready','processing','failed','delivered','manual_review')),
                attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
                attempt_token TEXT, lease_until INTEGER, artifact_sha256 TEXT,
                failure_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
        ''')
    return conn


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def audit(conn, action, object_id=None):
    conn.execute('INSERT INTO audit(at,action,object_id,actor) VALUES (?,?,?,?)',
                 (now(), action, object_id, AUDIT_ACTOR.get() or f'os_uid:{os.geteuid()}'))


def identifier(value):
    try:
        parsed = uuid.UUID(value)
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError('invalid identifier') from exc
    if str(parsed) != value:
        raise ValueError('invalid identifier')
    return value


def ticket_create(conn, category, service_id=None):
    if category not in CATEGORIES:
        raise ValueError('invalid category')
    if service_id is not None:
        identifier(service_id)
    ticket_id, timestamp = str(uuid.uuid4()), now()
    with conn:
        conn.execute('INSERT INTO tickets(id,category,status,created_at,updated_at,service_id) VALUES (?,?,?,?,?,?)', (ticket_id, category, 'open', timestamp, timestamp, service_id))
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


def finance_record(conn, kind, amount, request_key=None):
    if kind not in KINDS or type(amount) is not int or not 0 < amount <= MAX_AMOUNT:
        raise ValueError('invalid kind or amount in fen')
    entry_id = str(uuid.uuid4())
    if request_key is not None:
        identifier(request_key)
    with conn:
        conn.execute('BEGIN IMMEDIATE')
        if request_key:
            existing = conn.execute('SELECT * FROM entries WHERE request_key=?', (request_key,)).fetchone()
            if existing:
                if existing['kind'] != kind or existing['amount_fen'] != amount:
                    raise ValueError('request key is already bound to a different financial record')
                audit(conn, 'finance.record.reused', existing['id'])
                return existing['id']
        conn.execute('INSERT INTO entries(id,kind,amount_fen,created_at,reverses,request_key) VALUES (?,?,?,?,NULL,?)', (entry_id, kind, amount, now(), request_key))
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
        conn.execute('INSERT INTO entries(id,kind,amount_fen,created_at,reverses) VALUES (?,?,?,?,?)', (reversal_id, original['kind'], original['amount_fen'], now(), entry_id))
        audit(conn, 'finance.reverse', reversal_id)
    return reversal_id


def list_records(conn, role):
    table = {'support': 'tickets', 'finance': 'entries', 'delivery': 'services'}[role]
    with conn:
        rows = [dict(row) for row in conn.execute(f'SELECT * FROM {table} ORDER BY rowid DESC LIMIT 200')]
        audit(conn, role + '.list')
    return rows


def finance_summary(conn):
    with conn:
        totals = {kind: 0 for kind in KINDS}
        legacy_refunds = 0
        for row in conn.execute('SELECT kind, SUM(CASE WHEN reverses IS NULL THEN amount_fen ELSE -amount_fen END) AS total FROM entries GROUP BY kind'):
            if row['kind'] == 'refund':
                legacy_refunds = row['total']
            else:
                totals[row['kind']] = row['total']
        audit(conn, 'finance.summary')
    return {'currency': 'CNY', 'amount_unit': 'fen', 'totals': totals,
            'legacy_refund_fen': legacy_refunds,
            'net_recorded_fen': totals['income'] - totals['expense'] - legacy_refunds,
            'note': 'Manual entries only; not payment, bank balance, reconciliation or accounting statements.'}


def support_summary(conn):
    with conn:
        totals = {status: 0 for status in TRANSITIONS}
        for row in conn.execute('SELECT status, COUNT(*) AS total FROM tickets GROUP BY status'):
            totals[row['status']] = row['total']
        audit(conn, 'support.summary')
    return {'counts': totals, 'note': 'Counts only; no customer details or conversation content.'}


def sha256(value):
    if not isinstance(value, str) or len(value) != 64 or any(c not in '0123456789abcdef' for c in value):
        raise ValueError('expected a lowercase SHA-256 digest')
    return value


def epoch():
    return int(datetime.now(timezone.utc).timestamp())


def service_create(conn, request_key, authorization_ref, spec_sha256):
    """Register once after a trusted external system has authorized fulfillment.

    This internal register does not verify payments or confer public access.
    """
    identifier(request_key); identifier(authorization_ref); sha256(spec_sha256)
    with conn:
        conn.execute('BEGIN IMMEDIATE')
        existing = conn.execute('SELECT * FROM services WHERE request_key=?', (request_key,)).fetchone()
        if existing:
            if existing['authorization_ref'] != authorization_ref or existing['spec_sha256'] != spec_sha256:
                raise ValueError('request key is already bound to a different service specification')
            audit(conn, 'delivery.create.reused', existing['id'])
            return {'id': existing['id'], 'status': existing['status'], 'reused': True}
        if conn.execute('SELECT 1 FROM services WHERE authorization_ref=?', (authorization_ref,)).fetchone():
            raise ValueError('authorization reference is already assigned to one service')
        service_id, timestamp = str(uuid.uuid4()), now()
        conn.execute('''INSERT INTO services(id,request_key,authorization_ref,spec_sha256,offering,status,created_at,updated_at)
                        VALUES (?,?,?,?,?,'ready',?,?)''',
                     (service_id, request_key, authorization_ref, spec_sha256, 'naming-once-v1', timestamp, timestamp))
        audit(conn, 'delivery.create', service_id)
    return {'id': service_id, 'status': 'ready', 'reused': False}


def service_start(conn, service_id):
    identifier(service_id)
    with conn:
        conn.execute('BEGIN IMMEDIATE')
        item = conn.execute('SELECT * FROM services WHERE id=?', (service_id,)).fetchone()
        if not item or item['status'] not in ('ready', 'failed', 'processing'):
            raise ValueError('service is unavailable or already completed; reuse the delivered artifact')
        timestamp = epoch()
        if item['status'] == 'processing' and item['lease_until'] > timestamp:
            raise ValueError('a delivery attempt is already active')
        if item['attempts'] >= MAX_ATTEMPTS:
            conn.execute("UPDATE services SET status='manual_review',failure_reason='worker_timeout',updated_at=? WHERE id=?", (now(), service_id))
            audit(conn, 'delivery.manual_review', service_id)
            return {'id': service_id, 'status': 'manual_review'}
        token, deadline = str(uuid.uuid4()), timestamp + LEASE_SECONDS
        conn.execute("UPDATE services SET status='processing',attempts=attempts+1,attempt_token=?,lease_until=?,updated_at=? WHERE id=?", (token, deadline, now(), service_id))
        audit(conn, 'delivery.start', service_id)
    return {'id': service_id, 'status': 'processing', 'attempt_token': token, 'lease_until': deadline}


def service_finish(conn, service_id, token, artifact_sha256=None, reason=None):
    identifier(service_id); identifier(token)
    if (artifact_sha256 is None) == (reason is None):
        raise ValueError('provide exactly one artifact digest or failure reason')
    if artifact_sha256 is not None:
        sha256(artifact_sha256)
    elif reason not in ('generation_failed', 'artifact_unavailable', 'worker_timeout'):
        raise ValueError('invalid failure reason')
    with conn:
        conn.execute('BEGIN IMMEDIATE')
        item = conn.execute('SELECT * FROM services WHERE id=?', (service_id,)).fetchone()
        if not item or item['attempt_token'] != token:
            raise ValueError('unknown service or stale attempt token')
        if artifact_sha256 is not None and item['status'] == 'delivered' and item['artifact_sha256'] == artifact_sha256:
            audit(conn, 'delivery.complete.reused', service_id)
            return {'id': service_id, 'status': 'delivered', 'reused': True}
        if reason is not None and item['status'] in ('failed', 'manual_review') and item['failure_reason'] == reason:
            audit(conn, 'delivery.failure.reused', service_id)
            return {'id': service_id, 'status': item['status'], 'reused': True}
        if item['status'] != 'processing' or item['lease_until'] <= epoch():
            raise ValueError('delivery attempt is no longer active')
        status = 'delivered' if artifact_sha256 is not None else 'manual_review' if item['attempts'] >= MAX_ATTEMPTS else 'failed'
        conn.execute('UPDATE services SET status=?,artifact_sha256=?,failure_reason=?,updated_at=? WHERE id=?',
                     (status, artifact_sha256, reason, now(), service_id))
        audit(conn, 'delivery.' + status, service_id)
    return {'id': service_id, 'status': status, 'reused': False}


def service_summary(conn):
    with conn:
        counts = {status: 0 for status in ('ready', 'processing', 'failed', 'delivered', 'manual_review')}
        for row in conn.execute('SELECT status,COUNT(*) AS total FROM services GROUP BY status'):
            counts[row['status']] = row['total']
        audit(conn, 'delivery.summary')
    return {'counts': counts, 'note': 'Internal delivery metadata only; not proof of payment or customer receipt.'}


def service_status(conn, service_id):
    """Minimal projection for support; never return authorization, hashes or tokens."""
    identifier(service_id)
    with conn:
        row = conn.execute('SELECT id,status,attempts,updated_at FROM services WHERE id=?', (service_id,)).fetchone()
        if not row:
            raise ValueError('service does not exist')
        audit(conn, 'delivery.status.read', service_id)
    return dict(row)


def audit_history(conn, role):
    with conn:
        rows = [dict(row) for row in conn.execute('SELECT * FROM audit ORDER BY id DESC LIMIT 200')]
        audit(conn, role + '.audit.read')
    return rows


def parser():
    p = argparse.ArgumentParser(description='Role-isolated offline registers. Do not enter personal data.')
    p.add_argument('role', choices=ACCOUNTS)
    p.add_argument('action', choices=('init', 'create', 'move', 'record', 'reverse', 'list', 'summary', 'audit', 'start', 'complete', 'fail'))
    p.add_argument('--directory', help='Private role directory (default: /var/lib/xuming-ops/ROLE)')
    p.add_argument('--category', choices=CATEGORIES)
    p.add_argument('--status', choices=tuple(TRANSITIONS))
    p.add_argument('--id')
    p.add_argument('--kind', choices=KINDS)
    p.add_argument('--amount-fen', type=int)
    p.add_argument('--service-id', help='Opaque reference for a support ticket; does not grant service access')
    p.add_argument('--request-key')
    p.add_argument('--authorization-ref', help='External fulfillment authorization reference; this tool cannot verify payment')
    p.add_argument('--spec-sha256')
    p.add_argument('--attempt-token')
    p.add_argument('--artifact-sha256')
    p.add_argument('--reason', choices=('generation_failed', 'artifact_unavailable', 'worker_timeout'))
    return p


def main(argv=None):
    args = parser().parse_args(argv)
    supported = {'support': {'init', 'create', 'move', 'list', 'summary', 'audit'},
                 'finance': {'init', 'record', 'reverse', 'list', 'summary', 'audit'},
                 'delivery': {'init', 'create', 'start', 'complete', 'fail', 'list', 'summary', 'audit'}}
    if args.action not in supported[args.role]:
        raise ValueError('action is not available for this role')
    conn = connect(args.role, args.directory or f'/var/lib/xuming-ops/{args.role}')
    try:
        if args.action == 'init':
            with conn: audit(conn, args.role + '.init')
            result = {'initialized': args.role}
        elif args.action == 'create':
            result = service_create(conn, args.request_key, args.authorization_ref, args.spec_sha256) if args.role == 'delivery' else {'id': ticket_create(conn, args.category, args.service_id)}
        elif args.action == 'move': ticket_move(conn, args.id, args.status); result = {'updated': args.id, 'status': args.status}
        elif args.action == 'record': result = {'id': finance_record(conn, args.kind, args.amount_fen, args.request_key)}
        elif args.action == 'reverse': result = {'reversal_id': finance_reverse(conn, args.id)}
        elif args.action == 'list': result = list_records(conn, args.role)
        elif args.action == 'audit': result = audit_history(conn, args.role)
        elif args.action == 'start': result = service_start(conn, args.id)
        elif args.action == 'complete':
            if not args.artifact_sha256: raise ValueError('artifact digest is required')
            result = service_finish(conn, args.id, args.attempt_token, artifact_sha256=args.artifact_sha256)
        elif args.action == 'fail':
            if not args.reason: raise ValueError('failure reason is required')
            result = service_finish(conn, args.id, args.attempt_token, reason=args.reason)
        else: result = {'support': support_summary, 'finance': finance_summary, 'delivery': service_summary}[args.role](conn)
        print(json.dumps(result, ensure_ascii=False))
    finally:
        conn.close()


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, sqlite3.Error) as exc:
        print(f'operation failed: {exc}', file=sys.stderr)
        sys.exit(1)
