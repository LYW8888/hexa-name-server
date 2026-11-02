"""Narrow Unix-socket client; callers have no database paths or report keys."""
import json
import os
import socket


class ReportUnavailable(Exception):
    pass


class ReportRejected(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def call(action, args, actor='public', socket_path=None):
    target = socket_path or os.environ.get('XUMING_REPORTS_SOCKET')
    if not target:
        raise ReportUnavailable('报告登记暂未开通，请通过微信或QQ联系经营者。')
    raw = json.dumps({'action': action, 'args': args, 'actor': actor}, ensure_ascii=False).encode() + b'\n'
    if len(raw) > 65536:
        raise ReportRejected('提交内容过大，请减少文字后重试。')
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(20)
            client.connect(str(target))
            client.sendall(raw)
            with client.makefile('rb') as stream:
                response = stream.readline(8 * 1024 * 1024 + 1)
        if len(response) > 8 * 1024 * 1024 or not response.endswith(b'\n'):
            raise ValueError('invalid response')
        value = json.loads(response)
        if not isinstance(value, dict) or 'ok' not in value:
            raise ValueError('invalid response')
    except (OSError, ValueError) as exc:
        raise ReportUnavailable('报告服务暂时不可用，请稍后重试或直接联系经营者。') from exc
    if not value['ok']:
        raise ReportRejected(value.get('error', '操作未完成。'), value.get('status', 400))
    return value['result']
