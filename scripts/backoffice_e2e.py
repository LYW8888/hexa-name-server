"""Ephemeral browser-test fixture. Deliberately not a deployment entry point."""
import os
import secrets
import socketserver
import sys
import tempfile
import threading
from pathlib import Path

if os.environ.get('XUMING_E2E_TEST') != '1':
    raise SystemExit('This fixture requires XUMING_E2E_TEST=1 and is only for browser tests.')
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
with tempfile.TemporaryDirectory(prefix='xuming-browser-test-') as directory:
    home = Path(directory)
    auth = home/'auth'; auth.mkdir(mode=0o700)
    os.environ.update(DJANGO_SETTINGS_MODULE='backoffice.settings', XUMING_ADMIN_HOME=str(auth),
                      XUMING_ADMIN_SECRET=secrets.token_urlsafe(64), XUMING_ADMIN_DEV='1', XUMING_ADMIN_HOSTS='127.0.0.1')
    for role in ('support','finance','delivery'):
        os.environ[f'XUMING_{role.upper()}_SOCKET'] = str(home/f'{role}.sock')
    import django
    django.setup()
    from django.core.management import call_command
    from django.contrib.auth import get_user_model
    from django.core.wsgi import get_wsgi_application
    from django_otp.plugins.otp_totp.models import TOTPDevice
    from backoffice.models import StaffProfile
    from operations import console
    from operations.worker import WorkerHandler
    from wsgiref.simple_server import make_server, WSGIRequestHandler
    call_command('migrate', interactive=False, verbosity=0)
    for role in ('owner','support','finance','delivery'):
        user = get_user_model().objects.create_user(f'{role}_browser', password='Browser-Test-Only-482!')
        StaffProfile.objects.create(user=user, role=role, must_change_password=False)
        TOTPDevice.objects.create(user=user, confirmed=True, key='00112233445566778899aabbccddeeff00112233')
    # This fixture intentionally simulates the role identities under one test UID.
    # Production workers always enforce distinct OS identities; never serve this fixture to users.
    console.require_identity = lambda role: None
    workers=[]
    for role in ('support','finance','delivery'):
        data=home/role; data.mkdir(mode=0o700)
        worker=socketserver.UnixStreamServer(str(home/f'{role}.sock'), WorkerHandler)
        worker.admin_uid=os.geteuid(); worker.role=role; worker.directory=data
        threading.Thread(target=worker.serve_forever, daemon=True).start(); workers.append(worker)
    class Quiet(WSGIRequestHandler):
        def log_message(self, format, *args): pass
    try:
        with make_server('127.0.0.1',4192,get_wsgi_application(),handler_class=Quiet) as server:
            server.serve_forever()
    finally:
        for worker in workers:
            worker.shutdown(); worker.server_close()
