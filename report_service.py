"""Private encrypted report queue. Public UID may submit; admin UID may retrieve.

Run under a dedicated non-root account. Neither the naming process nor role
workers receive the storage path, encryption key, or permission to read reports.
"""
import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import socket
import socketserver
import signal
import sqlite3
import stat
import struct
import time
import uuid
from contextlib import contextmanager
from cryptography.fernet import Fernet, InvalidToken
from public_proposals import INPUT_FIELDS

RETENTION = 30 * 86400
MAX_RECORDS = 10000


class Rejected(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def identifier(value):
    try:
        result = str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise Rejected('申请编号格式无效。') from exc
    if result != value:
        raise Rejected('申请编号格式无效。')
    return result


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


class Store:
    def __init__(self, directory, key):
        self.directory = Path(directory)
        self.cipher = Fernet(key)
        self.digest_key = hashlib.sha256(key).digest()
        info = self.directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
            raise PermissionError('report directory must be private 0700 and owned by service account')
        self.path = self.directory / 'reports.sqlite3'
        if self.path.exists() or self.path.is_symlink():
            info = self.path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
                raise PermissionError('report database must be private and owned by service account')
        with self.connect() as db:
            db.executescript('''
              CREATE TABLE IF NOT EXISTS requests (
                id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, input_hash TEXT NOT NULL,
                client_hash TEXT NOT NULL, created_at REAL NOT NULL, expires_at REAL NOT NULL,
                status TEXT NOT NULL, ciphertext BLOB, delivered_at REAL);
              CREATE INDEX IF NOT EXISTS requests_client ON requests(client_hash, created_at);
              CREATE TABLE IF NOT EXISTS audit (
                id INTEGER PRIMARY KEY, at REAL NOT NULL, actor TEXT NOT NULL,
                action TEXT NOT NULL, request_id TEXT NOT NULL);
            ''')
        os.chmod(self.path, 0o600)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA secure_delete=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def audit(db, actor, action, reference=''):
        db.execute('INSERT INTO audit(at,actor,action,request_id) VALUES(?,?,?,?)', (time.time(), actor, action, reference))

    def purge(self, db):
        now = time.time()
        db.execute('UPDATE requests SET ciphertext=NULL WHERE expires_at<=? AND ciphertext IS NOT NULL', (now,))
        db.execute('DELETE FROM requests WHERE created_at<?', (now - 90 * 86400,))
        db.execute('DELETE FROM audit WHERE at<?', (now - 90 * 86400,))

    def create(self, args, actor):
        if set(args) - {'request_key', 'input', 'consent', 'expected_names', 'client'} or args.get('consent') is not True:
            raise Rejected('请明确同意将本次资料提交给经营者，用于整理和人工交付报告。')
        key = identifier(args.get('request_key'))
        data = args.get('input')
        if not isinstance(data, dict) or set(data) - INPUT_FIELDS:
            raise Rejected('起名资料包含无效字段。')
        expected = args.get('expected_names')
        if not isinstance(expected, list) or not 1 <= len(expected) <= 11 or any(not isinstance(x, str) or not 2 <= len(x) <= 5 for x in expected):
            raise Rejected('请先生成名字提案后，再申请完整报告。')
        payload_hash = hmac.new(self.digest_key, encode({'input': data, 'expected_names': expected}), hashlib.sha256).hexdigest()
        client = str(args.get('client', ''))[:128]
        client_hash = hmac.new(self.digest_key, client.encode(), hashlib.sha256).hexdigest()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            self.purge(db)
            previous = db.execute('SELECT * FROM requests WHERE request_key=?', (key,)).fetchone()
            if previous:
                if previous['input_hash'] != payload_hash:
                    raise Rejected('该提交编号已用于另一份资料，请重新生成提案后提交。', 409)
                if previous['ciphertext'] is None:
                    raise Rejected('原申请已删除或过期，请重新确认后提交。', 410)
                return {'id': previous['id'], 'status': previous['status'], 'reused': True, 'expires_at': previous['expires_at']}
            now = time.time()
            count = db.execute('SELECT COUNT(*) FROM requests WHERE client_hash=? AND created_at>?', (client_hash, now - 900)).fetchone()[0]
            if count >= 10:
                raise Rejected('申请较多，请稍后重试或直接联系经营者。', 429)
            if db.execute('SELECT COUNT(*) FROM requests WHERE created_at>?', (now - 86400,)).fetchone()[0] >= 500 or db.execute('SELECT COUNT(*) FROM requests WHERE ciphertext IS NOT NULL').fetchone()[0] >= MAX_RECORDS:
                raise Rejected('报告申请暂时较多，请直接联系经营者。', 429)
            from server import analyze
            result = analyze(data)
            if [row['name'] for row in result['candidates']] != expected:
                raise Rejected('名字提案已更新，请重新生成后再提交。', 409)
            reference = str(uuid.uuid4())
            envelope = {'version': 1, 'kind': 'operator_report', 'data': data, **result}
            ciphertext = self.cipher.encrypt(encode(envelope))
            db.execute('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,NULL)',
                       (reference, key, payload_hash, client_hash, now, now + RETENTION, 'new', ciphertext))
            self.audit(db, actor, 'report.requested', reference)
        return {'id': reference, 'status': 'new', 'reused': False, 'expires_at': now + RETENTION}

    def read(self, reference, actor):
        identifier(reference)
        with self.connect() as db:
            self.purge(db)
            row = db.execute('SELECT * FROM requests WHERE id=? AND ciphertext IS NOT NULL', (reference,)).fetchone()
            if not row:
                raise Rejected('申请不存在、已删除或已过期。', 404)
            result = self.decrypt(row)
            self.audit(db, actor, 'report.read', reference)
        return {'id': row['id'], 'status': row['status'], 'created_at': row['created_at'], 'expires_at': row['expires_at'], 'report': result}

    def decrypt(self, row):
        try:
            return json.loads(self.cipher.decrypt(bytes(row['ciphertext'])))
        except (InvalidToken, ValueError) as exc:
            raise Rejected('报告无法解密，请核对报告服务密钥与备份。', 503) from exc

    def dispatch(self, action, args, actor, admin):
        if not isinstance(args, dict):
            raise Rejected('请求格式无效。')
        if action == 'create':
            return self.create(args, actor)
        if not admin:
            raise Rejected('无权读取或管理报告。', 403)
        if action == 'read' and set(args) == {'id'}:
            return self.read(args['id'], actor)
        if action == 'list' and not set(args) - {'query'}:
            query = str(args.get('query', '')).strip()
            if query:
                matches = re.findall(r'(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b', query)
                if len(matches) != 1:
                    raise Rejected('请粘贴一个有效申请编号或含该编号的咨询信息。')
                query = identifier(matches[0].lower())
            with self.connect() as db:
                self.purge(db)
                sql = 'SELECT * FROM requests WHERE ciphertext IS NOT NULL'
                rows = db.execute(sql + (' AND id=?' if query else '') + ' ORDER BY created_at DESC LIMIT 100', (query,) if query else ()).fetchall()
                items = []
                for row in rows:
                    report = self.decrypt(row)
                    items.append({'id': row['id'], 'status': row['status'], 'created_at': row['created_at'], 'expires_at': row['expires_at'],
                                  'purpose': report['analysis']['purpose'], 'names': [x['name'] for x in report['candidates']]})
                self.audit(db, actor, 'report.list')
            return {'requests': items}
        if action in ('deliver', 'delete') and set(args) == {'id'}:
            reference = identifier(args['id'])
            with self.connect() as db:
                self.purge(db)
                row = db.execute('SELECT * FROM requests WHERE id=? AND ciphertext IS NOT NULL', (reference,)).fetchone()
                if not row:
                    raise Rejected('申请不存在、已删除或已过期。', 404)
                if action == 'delete':
                    db.execute('UPDATE requests SET ciphertext=NULL,status=? WHERE id=?', ('deleted', reference))
                elif row['status'] != 'delivered':
                    db.execute('UPDATE requests SET status=?,delivered_at=? WHERE id=?', ('delivered', time.time(), reference))
                self.audit(db, actor, f'report.{action}', reference)
            return {'ok': True}
        if action == 'audit' and not args:
            with self.connect() as db:
                return {'events': [dict(row) for row in db.execute('SELECT * FROM audit ORDER BY id DESC LIMIT 200')]}
        raise Rejected('操作或字段无效。')


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.request.settimeout(25)
        _, uid, _ = struct.unpack('3i', self.request.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        if uid not in (self.server.public_uid, self.server.admin_uid):
            return
        try:
            raw = self.rfile.readline(65537)
            if len(raw) > 65536 or not raw.endswith(b'\n'):
                raise Rejected('请求过大。')
            request = json.loads(raw)
            if not isinstance(request, dict) or set(request) != {'action', 'args', 'actor'}:
                raise Rejected('请求格式无效。')
            admin = uid == self.server.admin_uid
            actor = request['actor'] if admin else 'public'
            if admin and not re.fullmatch(r'staff:[1-9][0-9]{0,18}', str(actor)):
                raise Rejected('操作人无效。')
            result = self.server.store.dispatch(request['action'], request['args'], actor, admin)
            response = {'ok': True, 'result': result}
        except Rejected as exc:
            response = {'ok': False, 'error': str(exc), 'status': exc.status}
        except (ValueError, TypeError, KeyError):
            response = {'ok': False, 'error': '提交资料未通过校验，请检查后重试。', 'status': 400}
        except (OSError, sqlite3.Error):
            response = {'ok': False, 'error': '报告服务暂时不可用。', 'status': 503}
        self.wfile.write(json.dumps(response, ensure_ascii=False).encode() + b'\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--socket')
    parser.add_argument('--public-uid', type=int)
    parser.add_argument('--admin-uid', type=int)
    parser.add_argument('--purge-only', action='store_true')
    args = parser.parse_args()
    if os.geteuid() == 0: raise PermissionError('run reports as a dedicated non-root account')
    os.umask(0o077)
    store = Store(args.directory, os.environ['XUMING_REPORTS_KEY'].encode())
    if args.purge_only:
        with store.connect() as db: store.purge(db)
        return
    if args.public_uid is None or args.admin_uid is None or not args.socket:
        parser.error('--socket, --public-uid and --admin-uid are required when serving')
    if os.geteuid() == 0 or len({args.public_uid, args.admin_uid, os.geteuid()}) != 3 or min(args.public_uid, args.admin_uid) <= 0:
        raise PermissionError('reports, public and admin must use distinct non-root accounts')
    target = Path(args.socket)
    info = target.parent.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o022 or target.exists() or target.is_symlink():
        raise PermissionError('socket parent must be owned by reports account, not writable by others')
    with socketserver.ThreadingUnixStreamServer(str(target), Handler) as server:
        os.chmod(target, 0o660)
        server.public_uid, server.admin_uid, server.store = args.public_uid, args.admin_uid, store
        def stop(signum, frame):
            raise SystemExit(0)
        signal.signal(signal.SIGTERM, stop)
        try:
            server.serve_forever()
        finally:
            target.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
