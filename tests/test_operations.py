"""Operational register logic and fail-closed local permission checks."""
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from operations import console


class OperationsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def connect(self, role):
        with patch.object(console.pwd, 'getpwuid', return_value=SimpleNamespace(pw_name=console.ACCOUNTS[role])):
            return console.connect(role, self.directory)

    def test_identity_and_directory_fail_closed(self):
        with patch.object(console.pwd, 'getpwuid', return_value=SimpleNamespace(pw_name='xuming-support')):
            with self.assertRaises(PermissionError):
                console.connect('finance', self.directory)
        with patch.object(console.os, 'getuid', return_value=0):
            with self.assertRaises(PermissionError):
                console.require_identity('support')
        self.directory.chmod(0o750)
        with self.assertRaises(PermissionError):
            self.connect('support')
        self.directory.chmod(0o700)
        (self.directory / 'support.sqlite3').symlink_to(self.directory / 'elsewhere')
        with self.assertRaises(PermissionError):
            self.connect('support')

    def test_support_lifecycle_and_audit(self):
        with self.connect('support') as db:
            ticket = console.ticket_create(db, 'technical')
            console.ticket_move(db, ticket, 'in_progress')
            console.ticket_move(db, ticket, 'resolved')
            console.ticket_move(db, ticket, 'in_progress')
            console.ticket_move(db, ticket, 'closed')
            with self.assertRaises(ValueError):
                console.ticket_move(db, ticket, 'open')
            with self.assertRaises(ValueError):
                console.ticket_create(db, 'customer private message')
            self.assertEqual(console.support_summary(db)['counts']['closed'], 1)
            events = console.audit_history(db, 'support')
            self.assertEqual(events[0]['action'], 'support.summary')
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute('DELETE FROM audit')
            self.assertEqual(db.execute('SELECT COUNT(*) FROM tickets').fetchone()[0], 1)
        self.assertEqual((self.directory / 'support.sqlite3').stat().st_mode & 0o777, 0o600)

    def test_finance_reversal_is_unique_and_balanced(self):
        with self.connect('finance') as db:
            income = console.finance_record(db, 'income', 12500)
            console.finance_record(db, 'expense', 2500)
            console.finance_record(db, 'refund', 1000)
            self.assertEqual(console.finance_summary(db)['net_recorded_fen'], 9000)
            reversal = console.finance_reverse(db, income)
            self.assertEqual(console.finance_summary(db)['net_recorded_fen'], -3500)
            with self.assertRaises(ValueError):
                console.finance_reverse(db, income)
            with self.assertRaises(ValueError):
                console.finance_reverse(db, reversal)
            for invalid in (0, -1, True, console.MAX_AMOUNT + 1, None):
                with self.assertRaises(ValueError):
                    console.finance_record(db, 'income', invalid)
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute('UPDATE entries SET amount_fen=1')
            self.assertEqual(db.execute('SELECT COUNT(*) FROM entries').fetchone()[0], 4)

    def test_finance_and_support_are_separate_schemas(self):
        with self.connect('support') as support:
            console.ticket_create(support, 'usage')
        with self.connect('finance') as finance:
            with self.assertRaises(sqlite3.OperationalError):
                finance.execute('SELECT * FROM tickets')
            self.assertEqual(console.finance_summary(finance)['net_recorded_fen'], 0)

    def test_unavailable_action_fails_before_database_open(self):
        with self.assertRaises(ValueError):
            console.main(['support', 'record'])
        self.assertEqual(list(self.directory.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
