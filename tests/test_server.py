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
    def test_due_date_uses_default_reference_time(self):
        result = server.analyze({"mode":"due_date", "surname":"林", "parents":"沈", "place":"杭州", "date":"2099-04-16", "length":2, "gender":"unknown"})
        self.assertEqual(result["analysis"]["scenario"], "预产期参考")
        self.assertEqual(result["analysis"]["time"], "12:00")
        self.assertTrue(result["candidates"])
        self.assertTrue(all(len(item["given"]) == 2 for item in result["candidates"]))
    def test_born_date_requires_past_and_preserves_exact_time(self):
        result = server.analyze({"mode":"born", "surname":"林", "place":"杭州", "date":"2024-04-16", "time":"08:30", "length":2, "gender":"male"})
        self.assertEqual(result["analysis"]["scenario"], "已出生准确时间")
        self.assertEqual(result["analysis"]["time"], "08:30")
        self.assertEqual(result["analysis"]["gender"], "男")
    def test_born_time_is_required(self):
        with self.assertRaises(ValueError):
            server.analyze({"mode":"born", "surname":"林", "date":"2024-04-16", "length":2, "gender":"unknown"})
    def test_date_is_required(self):
        with self.assertRaises(ValueError):
            server.analyze({"mode":"due_date", "surname":"林", "length":2, "gender":"unknown"})
    def test_future_born_date_rejected(self):
        with self.assertRaises(ValueError):
            server.analyze({"mode":"born", "surname":"林", "date":"2999-01-01", "time":"08:30", "length":2, "gender":"female"})

if __name__ == "__main__":
    unittest.main()
