"""Single-role Unix socket worker. Only the configured admin service UID may call it."""
import argparse
import json
import os
import re
import socket
import socketserver
import sqlite3
import stat
import struct
from pathlib import Path
from . import console

ACTIONS = {
    'support': {'create': ('category', 'service_id'), 'move': ('id', 'status')},
    'finance': {'record': ('kind', 'amount_fen', 'request_key'), 'reverse': ('id',)},
    'delivery': {'create': ('request_key', 'authorization_ref', 'spec_sha256'), 'start': ('id',), 'status': ('id',),
                 'complete': ('id', 'attempt_token', 'artifact_sha256'), 'fail': ('id', 'attempt_token', 'reason')},
}


def dispatch(db, role, action, args):
    allowed = ACTIONS[role].get(action, ())
    if action not in {'summary', 'list', 'audit'} | set(ACTIONS[role]) or not isinstance(args, dict) or set(args) - set(allowed):
        raise ValueError('unsupported operation or fields')
    if action == 'summary': return {'support': console.support_summary, 'finance': console.finance_summary, 'delivery': console.service_summary}[role](db)
    if action == 'list': return console.list_records(db, role)
    if action == 'audit': return console.audit_history(db, role)
    if role == 'support':
        if action == 'create': return {'id': console.ticket_create(db, args.get('category'), args.get('service_id'))}
        console.ticket_move(db, args.get('id'), args.get('status')); return {'updated': args.get('id')}
    if role == 'finance':
        if action == 'record':
            console.identifier(args.get('request_key'))
            return {'id': console.finance_record(db, args.get('kind'), args.get('amount_fen'), args['request_key'])}
        return {'id': console.finance_reverse(db, args.get('id'))}
    if action == 'create': return console.service_create(db, args.get('request_key'), args.get('authorization_ref'), args.get('spec_sha256'))
    if action == 'status': return console.service_status(db, args.get('id'))
    if action == 'start': return console.service_start(db, args.get('id'))
    if action == 'complete':
        if not args.get('artifact_sha256'): raise ValueError('artifact digest is required')
        return console.service_finish(db, args.get('id'), args.get('attempt_token'), artifact_sha256=args['artifact_sha256'])
    if not args.get('reason'): raise ValueError('failure reason is required')
    return console.service_finish(db, args.get('id'), args.get('attempt_token'), reason=args['reason'])


class WorkerHandler(socketserver.StreamRequestHandler):
    def handle(self):
        self.request.settimeout(5)
        _, uid, _ = struct.unpack('3i', self.request.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        if uid != self.server.admin_uid:
            return
        try:
            raw = self.rfile.readline(65537)
            if len(raw) > 65536 or not raw.endswith(b'\n'):
                raise ValueError('invalid message size')
            request = json.loads(raw)
            if not isinstance(request, dict) or set(request) != {'actor', 'action', 'args'} or not re.fullmatch(r'staff:[1-9][0-9]{0,18}', str(request['actor'])) or not isinstance(request['action'], str):
                raise ValueError('invalid message')
            marker = console.AUDIT_ACTOR.set(request['actor'])
            try:
                db = console.connect(self.server.role, self.server.directory)
                try:
                    result = dispatch(db, self.server.role, request['action'], request['args'])
                finally:
                    db.close()
            finally:
                console.AUDIT_ACTOR.reset(marker)
            response = {'ok': True, 'result': result}
        except (ValueError, TypeError):
            response = {'ok': False, 'error': '字段无效、状态不允许或操作重复，请刷新后检查。'}
        except (OSError, sqlite3.Error):
            response = {'ok': False, 'error': '岗位服务暂时不可用，请联系管理员。'}
        self.wfile.write(json.dumps(response, ensure_ascii=False).encode() + b'\n')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('role', choices=console.ACCOUNTS)
    p.add_argument('--directory', required=True)
    p.add_argument('--socket', required=True)
    p.add_argument('--admin-uid', required=True, type=int)
    args = p.parse_args()
    console.require_identity(args.role)
    if args.admin_uid <= 0 or args.admin_uid == os.geteuid():
        raise PermissionError('admin must use a separate non-root UID')
    db = console.connect(args.role, args.directory); db.close()
    target = Path(args.socket)
    info = target.parent.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o022 or target.exists() or target.is_symlink():
        raise PermissionError('socket parent must be controlled by the role account; socket must not already exist')
    with socketserver.UnixStreamServer(str(target), WorkerHandler) as server:
        os.chmod(target, 0o660)
        server.role, server.directory, server.admin_uid = args.role, args.directory, args.admin_uid
        try:
            server.serve_forever()
        finally:
            target.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
