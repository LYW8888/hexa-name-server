"""Exercise public routes and malformed requests against a real HTTP server."""
import http.client
import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

import server


class HttpHandlerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old_db = server.DB
        cls.old_dist = server.DIST
        cls.tmp = tempfile.TemporaryDirectory()
        server.DB = Path(cls.tmp.name) / 'test.sqlite3'
        server.DIST = Path(cls.tmp.name) / 'dist'
        (server.DIST / 'assets').mkdir(parents=True)
        (server.DIST / 'index.html').write_text('<div id="root"></div>', encoding='utf-8')
        (server.DIST / 'service-worker.js').write_text('// test', encoding='utf-8')
        (server.DIST / 'manifest.webmanifest').write_text('{}', encoding='utf-8')
        (server.DIST / 'favicon.svg').write_text('<svg/>', encoding='utf-8')
        (server.DIST / 'assets' / 'index-abc123.js').write_text('// built asset', encoding='utf-8')
        server.init_db()
        cls.httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join()
        server.DB = cls.old_db
        server.DIST = cls.old_dist
        cls.tmp.cleanup()

    def test_generation_counter_failure_never_breaks_free_generation(self):
        from unittest.mock import patch
        import report_client
        payload={'surname':'林','mode':'due_date','dueDate':'2099-01-01','algorithm':'literary_v3'}
        with patch('server.report_client.call',side_effect=report_client.ReportUnavailable('not running')):
            status,_,body=self.request('POST','/api/analyze',json.dumps(payload),{'Content-Type':'application/json'})
        value=json.loads(body)
        self.assertEqual(status,200);self.assertFalse(value['experience']['available'])
        self.assertEqual(value['analysis']['access'],'proposal_only');self.assertEqual(len(value['candidates']),3)

    def test_generation_statistics_never_receive_birth_fields_or_candidate_names(self):
        from unittest.mock import patch
        payload={'surname':'林','mode':'due_date','dueDate':'2099-01-01','algorithm':'literary_v3'}
        with patch('server.report_client.call',return_value={'available':True,'generation_id':'id','generation_token':'private-token'}) as call:
            status,_,body=self.request('POST','/api/analyze',json.dumps(payload),{'Content-Type':'application/json'})
            self.assertEqual(status,200)
            self.assertEqual(call.call_args.args[0],'generation.record')
            args=call.call_args.args[1]
            self.assertEqual(set(args),{'metrics','fingerprint','client'})
            self.assertNotIn('2099-01-01',json.dumps(args));self.assertNotIn('surname',json.dumps(args))
            self.assertEqual(json.loads(body)['experience']['generation_token'],'private-token')

    def test_feedback_and_beta_endpoints_require_json_same_origin_and_strict_fields(self):
        from unittest.mock import patch
        for path in ('/api/experience-feedback','/api/beta-reports','/api/beta-reports/read'):
            with self.subTest(path=path),patch('server.report_client.call',return_value={'ok':True}) as call:
                self.assertEqual(self.request('POST',path,'{}',{'Content-Type':'application/json','Origin':'https://other.invalid'})[0],403)
                self.assertEqual(self.request('POST',path,'{}',{'Content-Type':'text/plain'})[0],415)
                self.assertEqual(self.request('POST',path,json.dumps({'role':'owner','report':{}}),{'Content-Type':'application/json'})[0],400)
                call.assert_not_called()
                self.assertEqual(self.request('GET',path)[0],404)

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.httpd.server_port, timeout=3)
        try:
            conn.request(method, path, body=body, headers=headers or {})
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            conn.close()

    def test_public_assets_and_apis_are_available(self):
        for path in sorted(server.PUBLIC_ASSETS):
            with self.subTest(path=path):
                status, headers, body = self.request('GET', path + '?v=1')
                self.assertEqual(status, 200)
                self.assertTrue(body)
                self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
                self.assertIn('no-store', headers['Cache-Control'])
        for path in ('/api/health', '/api/catalog', '/api/classics', '/api/product', '/api/name-counts'):
            with self.subTest(path=path):
                status, _, body = self.request('GET', path)
                self.assertEqual(status, 200)
                json.loads(body)

    def test_private_files_and_path_aliases_are_not_served(self):
        for method in ('GET', 'HEAD'):
            for path in ('/data/', '/data/naming.sqlite3', '/.git/config', '/server.py', '/phonetics.py',
                         '/tests/test_server.py', '/README.md', '/operations/console.py', '/operations/', '/backoffice/settings.py', '/customer/settings.py', '/admin.html', '/data/../server.py',
                         '/data/%2e%2e/server.py', '/%2e%67it/config', '/frontend/package.json',
                         '/assets/../index.html', '/assets/%2e%2e/index.html'):
                with self.subTest(method=method, path=path):
                    status, _, _ = self.request(method, path)
                    self.assertEqual(status, 404)

    def test_customer_capability_stub_does_not_authenticate_or_issue_cookies(self):
        status, headers, body = self.request('GET', '/api/customer/session', headers={'Cookie':'__Secure-xuming_customer=staff-or-customer-session'})
        self.assertEqual(status,200)
        self.assertIsNone(json.loads(body)['customer'])
        self.assertFalse(json.loads(body)['sms_available'])
        self.assertNotIn('Set-Cookie',headers)

    def test_built_assets_and_missing_build_behavior(self):
        status, _, body = self.request('GET', '/assets/index-abc123.js')
        self.assertEqual(status, 200)
        self.assertEqual(body, b'// built asset')
        outside = Path(self.tmp.name) / 'secret.js'
        outside.write_text('private', encoding='utf-8')
        (server.DIST / 'assets' / 'leak.js').symlink_to(outside)
        self.assertEqual(self.request('GET', '/assets/leak.js')[0], 404)
        from unittest.mock import patch
        with patch.object(server, 'DIST', Path(self.tmp.name) / 'missing'):
            self.assertEqual(self.request('GET', '/')[0], 503)
            self.assertEqual(self.request('GET', '/api/health')[0], 200)

    def test_analyze_is_not_cached_and_handles_invalid_bodies(self):
        valid = {'mode': 'due_date', 'surname': '林', 'dueDate': '2099-01-01',
                 'place': '杭州', 'length': 2, 'gender': 'unknown'}
        status, headers, body = self.request('POST', '/api/analyze', json.dumps(valid), {'Content-Type': 'application/json'})
        self.assertEqual(status, 200)
        self.assertIn('no-store', headers['Cache-Control'])
        data = json.loads(body)
        self.assertEqual(data['analysis']['access'], 'proposal_only')
        self.assertNotIn('bazi',data['analysis'])
        self.assertEqual(set(data['candidates'][0]),{'name','given','pinyin','meaning'})
        for raw in (b'[]', b'null', b'{', json.dumps({**valid, 'styles': [{}]}).encode()):
            with self.subTest(body=raw):
                status, _, body = self.request('POST', '/api/analyze', raw, {'Content-Type': 'application/json'})
                self.assertEqual(status, 400)
                self.assertIn('error', json.loads(body))
        for length in ('-1', str(65537), 'invalid'):
            with self.subTest(length=length):
                status, _, body = self.request('POST', '/api/analyze', b'', {'Content-Length': length})
                self.assertEqual(status, 400)
                self.assertIn('error', json.loads(body))

    def test_name_review_is_uncached_validated_and_distinct_from_recommendations(self):
        payload = {"purpose":"rename", "mode":"born", "surname":"李", "currentName":"李景和", "birthDate":"1998-08-13", "birthTime":"13:48", "place":"河南南阳"}
        status, headers, body = self.request('POST', '/api/name-review', json.dumps(payload), {'Content-Type':'application/json'})
        self.assertEqual(status,200)
        self.assertIn('no-store',headers['Cache-Control'])
        value = json.loads(body)
        self.assertEqual(value['candidates'],[])
        self.assertEqual(value['analysis']['current_name'],'李景和')
        self.assertTrue(value['analysis']['review_completed'])
        self.assertNotIn('name_review',value['analysis'])
        for data in ({**payload,'currentName':''},{**payload,'purpose':'newborn'},{**payload,'dueDate':'2099-01-01'}):
            with self.subTest(data=data):
                status, _, _ = self.request('POST','/api/name-review',json.dumps(data),{'Content-Type':'application/json'})
                self.assertEqual(status,400)

    def test_literary_profile_reference_metadata_and_private_raw_files(self):
        status,_,body=self.request('GET','/api/naming-corpus')
        self.assertEqual(status,200)
        self.assertEqual(json.loads(body)['character_records'],3636)
        status,_,body=self.request('GET','/api/name-counts?algorithm=literary_v3')
        self.assertEqual(status,200)
        self.assertGreater(json.loads(body)['counts']['2'],65)
        for path in ('/data/naming/raw/诗经.txt','/data/naming-corpus.sqlite3','/data/naming/rules.json'):
            self.assertEqual(self.request('GET',__import__('urllib.parse',fromlist=['quote']).quote(path,safe='/'))[0],404)
        self.assertEqual(self.request('GET','/api/name-counts?algorithm=unknown')[0],400)

    def test_selected_surname_readings_and_literary_constraints(self):
        from urllib.parse import quote
        status,_,body=self.request('GET','/api/surname-readings?surname='+quote('单'))
        self.assertEqual(status,200)
        self.assertEqual(json.loads(body)['default'],'shàn')
        data={'algorithm':'literary_v3','surname':'李','mode':'due_date','dueDate':'2099-01-01','place':'杭州','requiredChars':'安','candidateCount':7}
        status,headers,body=self.request('POST','/api/analyze',json.dumps(data),{'Content-Type':'application/json'})
        self.assertEqual(status,200)
        self.assertIn('no-store',headers['Cache-Control'])
        response=json.loads(body)
        self.assertEqual(len(response['candidates']),7)
        self.assertTrue(all('安' in x['given'] for x in response['candidates']))

    def test_optional_birth_city_and_automatic_solar_coordinates(self):
        base = {'surname':'林', 'mode':'due_date', 'dueDate':'2099-01-01'}
        for extra, applied in (({}, False), ({'place':'臺北市', 'timeBasis':'apparent_solar'}, True)):
            with self.subTest(extra=extra):
                status, _, body = self.request('POST', '/api/analyze', json.dumps({**base, **extra}), {'Content-Type':'application/json'})
                self.assertEqual(status, 200)
                analysis = json.loads(body)['analysis']
                self.assertEqual(analysis['access'],'proposal_only')
                self.assertNotIn('bazi',analysis)

    def test_report_access_cannot_be_obtained_by_flags_headers_or_old_download_routes(self):
        payload={'surname':'林','dueDate':'2099-01-01','algorithm':'literary_v3','includeReport':True,'paid':True,'role':'owner'}
        status,_,body=self.request('POST','/api/analyze?full=1',json.dumps(payload),{'Content-Type':'application/json','X-Role':'owner'})
        self.assertEqual(status,200)
        value=json.loads(body)
        self.assertNotIn('bazi',value['analysis'])
        self.assertNotIn('ranking',value['candidates'][0])
        for path in ('/api/reports','/api/report-requests/11111111-1111-4111-8111-111111111111','/reports.sqlite3','/report_service.py'):
            self.assertEqual(self.request('GET',path)[0],404)

    def test_report_registration_requires_only_supported_fields_and_same_origin(self):
        from unittest.mock import patch
        with patch('server.report_client.call',return_value={'id':'receipt','status':'new'}) as call:
            args={'request_key':'test','consent':True,'input':{},'expected_names':['林安']}
            status,_,_=self.request('POST','/api/report-requests',json.dumps(args),{'Content-Type':'application/json','Origin':'https://other.invalid'})
            self.assertEqual(status,403);call.assert_not_called()
            status,_,_=self.request('POST','/api/report-requests',json.dumps({**args,'report':{}}),{'Content-Type':'application/json'})
            self.assertEqual(status,400);call.assert_not_called()
            status,_,body=self.request('POST','/api/report-requests',json.dumps(args),{'Content-Type':'application/json'})
            self.assertEqual(status,201);self.assertEqual(json.loads(body)['id'],'receipt')
            self.assertEqual(call.call_args.args[1]['client'],'127.0.0.1')

    def test_source_header_is_trusted_only_behind_explicit_loopback_proxy_configuration(self):
        from unittest.mock import patch
        args={'request_key':'test','consent':True,'input':{},'expected_names':['林安']}
        with patch('server.report_client.call',return_value={'id':'receipt'}) as call:
            for trust, expected in (('0','127.0.0.1'),('1','203.0.113.8')):
                with patch.dict('os.environ',{'XUMING_TRUST_PROXY':trust}):
                    self.request('POST','/api/report-requests',json.dumps(args),{'Content-Type':'application/json','X-Real-IP':'203.0.113.8'})
                    self.assertEqual(call.call_args.args[1]['client'],expected)
