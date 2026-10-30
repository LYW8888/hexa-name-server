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
                         '/tests/test_server.py', '/README.md', '/operations/console.py', '/operations/', '/data/../server.py',
                         '/data/%2e%2e/server.py', '/%2e%67it/config', '/frontend/package.json',
                         '/assets/../index.html', '/assets/%2e%2e/index.html'):
                with self.subTest(method=method, path=path):
                    status, _, _ = self.request(method, path)
                    self.assertEqual(status, 404)

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
        self.assertEqual(len(data['analysis']['bazi']['pillars']), 4)
        self.assertEqual(data['candidates'][0]['pronunciation']['source']['library'], 'pypinyin')
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
