"""Real Unix-peer authentication and role-limited worker dispatch."""
import json
import os
import socket
import socketserver
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from operations.worker import WorkerHandler


class WorkerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        self.path = self.home / 'worker.sock'
        self.server = socketserver.UnixStreamServer(str(self.path), WorkerHandler)
        self.server.admin_uid = os.geteuid()
        self.server.role = 'support'
        self.server.directory = self.home
        self.patch = patch('operations.console.require_identity').start()
        self.addCleanup(patch.stopall)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)

    def stop(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()

    def request(self, action, args):
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(3); client.connect(str(self.path))
            client.sendall(json.dumps({'actor':'staff:42','action':action,'args':args}).encode()+b'\n')
            return json.loads(client.makefile('rb').readline())

    def test_worker_executes_only_its_role_and_records_employee_actor(self):
        result = self.request('create', {'category':'delivery'})
        self.assertTrue(result['ok'])
        self.assertFalse(self.request('record', {'kind':'income','amount_fen':100})['ok'])
        result = self.request('audit', {})
        self.assertEqual(result['result'][0]['actor'], 'staff:42')
        self.assertFalse(self.request('create', {'category':'usage','database':'/other'})['ok'])
        with sqlite3.connect(self.home/'support.sqlite3') as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM tickets').fetchone()[0], 1)

    def test_unapproved_process_uid_receives_no_response_or_data(self):
        self.server.admin_uid = os.geteuid() + 1
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(3); client.connect(str(self.path))
            self.assertEqual(client.recv(1), b'')
        self.assertFalse((self.home/'support.sqlite3').exists())
