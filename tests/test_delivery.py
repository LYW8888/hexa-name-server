"""One-time internal fulfillment: idempotency, retry leases and role boundaries."""
import sqlite3
import tempfile
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from operations import console


class DeliveryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.directory = Path(self.tmp.name)
        with patch.object(console.pwd, 'getpwuid', return_value=SimpleNamespace(pw_name='xuming-delivery')):
            self.db = console.connect('delivery', self.directory)
        self.addCleanup(self.db.close)
        self.clock = patch.object(console, 'epoch', return_value=10000).start()
        self.addCleanup(patch.stopall)
        self.key, self.authorization = str(uuid.uuid4()), str(uuid.uuid4())
        self.spec, self.artifact = 'a' * 64, 'b' * 64

    def create(self):
        return console.service_create(self.db, self.key, self.authorization, self.spec)['id']

    def test_one_authorization_has_one_immutable_service(self):
        service = self.create()
        again = console.service_create(self.db, self.key, self.authorization, self.spec)
        self.assertEqual(again, {'id': service, 'status': 'ready', 'reused': True})
        for key, authorization, spec in ((self.key, self.authorization, 'c' * 64),
                                         (str(uuid.uuid4()), self.authorization, self.spec),
                                         (self.key, str(uuid.uuid4()), self.spec)):
            with self.assertRaises(ValueError):
                console.service_create(self.db, key, authorization, spec)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM services').fetchone()[0], 1)

    def test_delivery_completion_is_idempotent_and_cannot_overwrite_report(self):
        service = self.create()
        attempt = console.service_start(self.db, service)
        token = attempt['attempt_token']
        self.assertEqual(console.service_finish(self.db, service, token, artifact_sha256=self.artifact)['status'], 'delivered')
        self.assertTrue(console.service_finish(self.db, service, token, artifact_sha256=self.artifact)['reused'])
        with self.assertRaises(ValueError):
            console.service_finish(self.db, service, token, artifact_sha256='c' * 64)
        with self.assertRaises(ValueError):
            console.service_start(self.db, service)
        self.assertEqual(console.service_summary(self.db)['counts']['delivered'], 1)

    def test_failures_retry_same_service_and_reject_stale_worker(self):
        service = self.create()
        first = console.service_start(self.db, service)['attempt_token']
        self.assertEqual(console.service_finish(self.db, service, first, reason='generation_failed')['status'], 'failed')
        self.assertTrue(console.service_finish(self.db, service, first, reason='generation_failed')['reused'])
        second = console.service_start(self.db, service)['attempt_token']
        with self.assertRaises(ValueError):
            console.service_finish(self.db, service, first, artifact_sha256=self.artifact)
        self.assertEqual(console.service_finish(self.db, service, second, artifact_sha256=self.artifact)['status'], 'delivered')
        self.assertEqual(self.db.execute('SELECT attempts FROM services').fetchone()[0], 2)

    def test_expired_workers_recover_and_eventually_require_manual_review(self):
        service = self.create()
        token = console.service_start(self.db, service)['attempt_token']
        self.clock.return_value += console.LEASE_SECONDS
        with self.assertRaises(ValueError):
            console.service_finish(self.db, service, token, artifact_sha256=self.artifact)
        for _ in range(2):
            console.service_start(self.db, service)
            self.clock.return_value += console.LEASE_SECONDS
        self.assertEqual(console.service_start(self.db, service)['status'], 'manual_review')
        with self.assertRaises(ValueError):
            console.service_start(self.db, service)

    def test_three_explicit_failures_stop_automatic_retry(self):
        service = self.create()
        for index in range(console.MAX_ATTEMPTS):
            token = console.service_start(self.db, service)['attempt_token']
            outcome = console.service_finish(self.db, service, token, reason='artifact_unavailable')
            self.assertEqual(outcome['status'], 'manual_review' if index == 2 else 'failed')
        with self.assertRaises(ValueError):
            console.service_start(self.db, service)

    def test_concurrent_workers_cannot_start_duplicate_attempts(self):
        service = self.create()
        def start(_):
            with closing(sqlite3.connect(self.directory / 'delivery.sqlite3', timeout=5)) as db:
                db.row_factory = sqlite3.Row
                try:
                    return console.service_start(db, service)['status']
                except ValueError:
                    return 'rejected'
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(start, range(2)))
        self.assertEqual(sorted(outcomes), ['processing', 'rejected'])
        self.assertEqual(self.db.execute('SELECT attempts FROM services').fetchone()[0], 1)

    def test_finance_and_support_cannot_drive_delivery(self):
        for role in ('support', 'finance'):
            with self.assertRaises(ValueError):
                console.main([role, 'start', '--id', str(uuid.uuid4())])
            with patch.object(console.pwd, 'getpwuid', return_value=SimpleNamespace(pw_name=console.ACCOUNTS[role])):
                with self.assertRaises(PermissionError):
                    console.connect('delivery', self.directory)
        for invalid in ('private customer information', 'A' * 64, ''):
            with self.assertRaises(ValueError):
                console.service_create(self.db, self.key, self.authorization, invalid)
        for table in ('tickets', 'entries'):
            with self.assertRaises(sqlite3.OperationalError):
                self.db.execute(f'SELECT * FROM {table}')

    def test_support_status_projection_excludes_authorization_and_report_data(self):
        service = self.create()
        console.service_start(self.db, service)
        status = console.service_status(self.db, service)
        self.assertEqual(set(status), {'id', 'status', 'attempts', 'updated_at'})
        self.assertEqual(status['status'], 'processing')


if __name__ == '__main__':
    unittest.main()
