"""Loopback-only ephemeral fixture; never deploy as a customer service."""
import http.client
import os
import secrets
import sys
import tempfile
import threading
from pathlib import Path
from urllib.parse import urlparse
from wsgiref.simple_server import make_server, WSGIRequestHandler
from http.server import ThreadingHTTPServer
from cryptography.fernet import Fernet

if os.environ.get('XUMING_CUSTOMER_E2E_TEST') != '1':
    raise SystemExit('Customer fixture requires XUMING_CUSTOMER_E2E_TEST=1; never expose it to users.')
for name in tuple(os.environ):
    if name.startswith('XUMING_SMS_'): os.environ.pop(name)
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
with tempfile.TemporaryDirectory(prefix='xuming-customer-browser-') as directory:
    home=Path(directory); auth=home/'auth'; auth.mkdir(mode=0o700)
    os.environ.update(DJANGO_SETTINGS_MODULE='customer.settings',XUMING_CUSTOMER_HOME=str(auth),
                      XUMING_CUSTOMER_SECRET=secrets.token_urlsafe(64),XUMING_CUSTOMER_PHONE_KEY=secrets.token_urlsafe(64),
                      XUMING_CUSTOMER_REPORT_KEY=Fernet.generate_key().decode(),XUMING_CUSTOMER_DEV='1',XUMING_CUSTOMER_HOSTS='127.0.0.1')
    import django
    django.setup()
    from django.core.management import call_command
    from django.core.wsgi import get_wsgi_application
    from customer import sms, views
    import server
    call_command('migrate',interactive=False,verbosity=0)
    sms.available=lambda:True
    sms.send=lambda phone,code:None  # No external messages, including in tests.
    views.secrets.randbelow=lambda maximum:604921
    server.DB=home/'catalog.sqlite3'; server.init_db()
    class Quiet(WSGIRequestHandler):
        def log_message(self,format,*args):pass
    customer=make_server('127.0.0.1',4194,get_wsgi_application(),handler_class=Quiet)
    threading.Thread(target=customer.serve_forever,daemon=True).start()
    class Public(server.Handler):
        def relay(self):
            size=int(self.headers.get('Content-Length','0'))
            if size>65536 or size<0:return self.send_error(400)
            headers={key:value for key,value in self.headers.items() if key.lower() not in ('connection','transfer-encoding')}
            connection=http.client.HTTPConnection('127.0.0.1',4194,timeout=10)
            try:
                connection.request(self.command,self.path,body=self.rfile.read(size) if size else None,headers=headers)
                response=connection.getresponse(); data=response.read()
                self.send_response(response.status)
                for key,value in response.getheaders():
                    if key.lower() not in ('connection','transfer-encoding','content-length'):self.send_header(key,value)
                self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
            finally:connection.close()
        def do_GET(self):
            if urlparse(self.path).path.startswith('/api/customer/'):return self.relay()
            return super().do_GET()
        def do_POST(self):
            if urlparse(self.path).path.startswith('/api/customer/'):return self.relay()
            return super().do_POST()
    try:
        with ThreadingHTTPServer(('127.0.0.1',4193),Public) as public:public.serve_forever()
    finally:customer.shutdown();customer.server_close()
