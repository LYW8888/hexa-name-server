"""The web process holds no role database paths or SQL connections."""
import json
import socket
from django.conf import settings


class WorkerUnavailable(Exception):
    pass


class WorkerRejected(Exception):
    pass


def call(role, action, args, actor_id):
    payload = json.dumps({'actor': f'staff:{actor_id}', 'action': action, 'args': args}).encode() + b'\n'
    if len(payload) > 65536:
        raise WorkerRejected('请求过大。')
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(8)
            client.connect(settings.WORKER_SOCKETS[role])
            client.sendall(payload)
            with client.makefile('rb') as stream:
                raw = stream.readline(2 * 1024 * 1024 + 1)
            if len(raw) > 2 * 1024 * 1024 or not raw.endswith(b'\n'):
                raise ValueError('invalid worker response')
            response = json.loads(raw)
    except (OSError, ValueError, KeyError) as exc:
        raise WorkerUnavailable('岗位服务未连接，请联系管理员。') from exc
    if not response.get('ok'):
        raise WorkerRejected(response.get('error', '操作未完成。'))
    return response['result']
