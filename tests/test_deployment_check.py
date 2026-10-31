import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from scripts.check_site import check_site, CheckFailure


class DeploymentCheckTest(unittest.TestCase):
    def setUp(self):
        test=self
        self.legacy=False; self.missing=False; self.api_html=False; self.old_review=False
        class Handler(BaseHTTPRequestHandler):
            def send(self,content,kind='application/json',status=200):
                raw=content.encode();self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
            def do_GET(self):
                if self.path=='/':return self.send('<form id="namingForm"></form>' if test.legacy else '<div id="root"></div><script type="module" src="/assets/main-test.js"></script><link rel="stylesheet" href="/assets/main-test.css">','text/html')
                if self.path.endswith('.js'):return self.send('// bundle','text/javascript',404 if test.missing else 200)
                if self.path.endswith('.css'):return self.send('body{}','text/css')
                if self.path=='/api/naming-corpus':return self.send(json.dumps({'character_records':3636,'selected_phrases':82}))
                return self.send('{"status":"ok"}')
            def do_POST(self):
                payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                if test.api_html:return self.send('<html>wrong route</html>','text/html')
                if self.path=='/api/name-review':
                    test.assertEqual(payload['currentName'],'李景和')
                    if test.old_review:return self.send('{}')
                    return self.send(json.dumps({'analysis':{'algorithm':'literary_v3','ranking_version':'literary-match-v3','workflow':{'id':'rename'},'phase':'name_review','name_review':{'full_name':'李景和'}},'candidates':[]}))
                due=payload['mode']=='due_date'
                if due:test.assertEqual(payload['dueDate'],'2099-01-01')
                return self.send(json.dumps({'analysis':{'algorithm':'literary_v3','ranking_version':'literary-match-v3','workflow':{'id':'newborn_due_date' if due else 'newborn_born'},'bazi':{'reference':due,'pillars':[{}, {}, {}, {}]}},'candidates':[{'given':'知衡'},{'given':'景和'},{'given':'知行'}]}))
            def log_message(self,*args):pass
        self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.url=f'http://127.0.0.1:{self.server.server_port}'
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join()
    def test_full_build_and_generation_pass(self):
        self.assertEqual(check_site(self.url)['candidate_count'],3)
    def test_old_html_is_rejected_even_with_a_healthy_api(self):
        self.legacy=True
        with self.assertRaisesRegex(CheckFailure,'旧版或静态页面'):check_site(self.url)
    def test_stale_react_entry_is_rejected_against_expected_build(self):
        with self.assertRaisesRegex(CheckFailure,'本次本地构建不一致'):
            check_site(self.url,expected_modules=['/assets/main-new-build.js'])
    def test_missing_bundle_and_static_api_fallback_fail(self):
        self.missing=True
        with self.assertRaisesRegex(CheckFailure,'HTTP 404'):check_site(self.url)
        self.missing=False;self.api_html=True
        with self.assertRaisesRegex(CheckFailure,'未返回 JSON'):check_site(self.url)

    def test_missing_rename_review_route_is_rejected(self):
        self.old_review=True
        with self.assertRaisesRegex(CheckFailure,'现名分析接口未完整部署'):
            check_site(self.url)
