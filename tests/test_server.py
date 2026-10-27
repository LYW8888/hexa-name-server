import json, tempfile, unittest
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
    def test_length_and_family_signal(self):
        result = server.analyze({"surname":"林", "parents":"沈", "place":"杭州", "date":"2024-04-16", "time":"08:30", "length":2, "styles":["nature"]})
        self.assertTrue(result["analysis"]["family_signal"])
        self.assertTrue(result["candidates"])
        self.assertTrue(all(len(item["given"]) == 2 for item in result["candidates"]))
    def test_future_date_rejected(self):
        with self.assertRaises(ValueError):
            server.analyze({"surname":"林", "date":"2999-01-01", "length":2})

if __name__ == "__main__":
    unittest.main()
