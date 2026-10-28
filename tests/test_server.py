import tempfile
import unittest
from pathlib import Path
import server

class ServerRulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old = server.DB
        cls.tmp = tempfile.TemporaryDirectory()
        server.DB = Path(cls.tmp.name) / "test.sqlite3"
        server.init_db()
    @classmethod
    def tearDownClass(cls):
        server.DB = cls.old
        cls.tmp.cleanup()
    def test_due_date_can_be_future_and_uses_default_time(self):
        result = server.analyze({"mode":"due_date", "surname":"林", "parents":"沈", "place":"杭州", "date":"2099-04-16", "length":2, "gender":"unknown"})
        self.assertEqual(result["analysis"]["scenario"], "预产期参考")
        self.assertEqual(result["analysis"]["due_date"], "2099-04-16")
        self.assertEqual(result["analysis"]["due_time"], "12:00")
        self.assertTrue(result["candidates"])
    def test_due_date_and_actual_birth_can_coexist(self):
        result = server.analyze({"mode":"due_date", "surname":"林", "dueDate":"2024-04-20", "dueTime":"10:00", "birthDate":"2024-04-16", "birthTime":"08:30", "place":"杭州", "length":2, "gender":"female"})
        self.assertEqual(result["analysis"]["scenario"], "预产期参考 + 已出生信息")
        self.assertEqual(result["analysis"]["time"], "08:30")
        self.assertEqual(result["analysis"]["due_date"], "2024-04-20")
        self.assertEqual(result["analysis"]["birth_date"], "2024-04-16")
        self.assertEqual(result["analysis"]["gender"], "女")
    def test_born_requires_actual_date_and_time(self):
        result = server.analyze({"mode":"born", "surname":"林", "dueDate":"2024-04-20", "dueTime":"10:00", "birthDate":"2024-04-16", "birthTime":"08:30", "place":"杭州", "length":2, "gender":"male"})
        self.assertEqual(result["analysis"]["scenario"], "已出生准确时间")
        self.assertEqual(result["analysis"]["time"], "08:30")
    def test_missing_actual_time_is_rejected(self):
        with self.assertRaises(ValueError):
            server.analyze({"mode":"born", "surname":"林", "birthDate":"2024-04-16", "length":2, "gender":"unknown"})
    def test_future_actual_date_is_rejected(self):
        with self.assertRaises(ValueError):
            server.analyze({"mode":"born", "surname":"林", "birthDate":"2999-01-01", "birthTime":"08:30", "length":2, "gender":"female"})
    def test_invalid_due_time_is_rejected_but_future_due_date_is_valid(self):
        with self.assertRaisesRegex(ValueError, "dueTime"):
            server.analyze({"mode":"due_date", "surname":"林", "dueDate":"2099-01-01", "dueTime":"25:90", "place":"杭州", "length":2, "gender":"unknown"})
    def test_place_is_required_for_analysis(self):
        with self.assertRaisesRegex(ValueError, "place"):
            server.analyze({"mode":"due_date", "surname":"林", "dueDate":"2099-01-01", "length":2, "gender":"unknown"})

if __name__ == "__main__":
    unittest.main()
