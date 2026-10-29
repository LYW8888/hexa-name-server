import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
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
    def test_candidate_count_is_customizable_end_to_end(self):
        result = server.analyze({"mode":"due_date", "surname":"林", "dueDate":"2099-01-01", "place":"杭州", "length":2, "candidateCount":5, "gender":"unknown"})
        self.assertEqual(result["analysis"]["candidate_count"], 5)
        self.assertEqual(result["analysis"]["available_candidate_count"], 15)
        self.assertEqual(len(result["candidates"]), 5)
    def test_candidate_count_range_is_validated(self):
        with self.assertRaisesRegex(ValueError, "candidateCount"):
            server.analyze({"mode":"due_date", "surname":"林", "dueDate":"2099-01-01", "place":"杭州", "length":2, "candidateCount":12, "gender":"unknown"})
    def test_candidate_count_reports_available_limit(self):
        result = server.analyze({"mode":"due_date", "surname":"林", "dueDate":"2099-01-01", "place":"杭州", "length":3, "candidateCount":11, "gender":"unknown"})
        self.assertEqual(result["analysis"]["requested_candidate_count"], 11)
        self.assertEqual(result["analysis"]["candidate_count"], len(result["candidates"]))
        self.assertEqual(result["analysis"]["candidate_count"], 5)
        self.assertEqual(result["analysis"]["available_candidate_count"], 5)
        self.assertLess(result["analysis"]["candidate_count"], 11)
    def test_rename_purpose_uses_born_flow_and_is_labeled(self):
        result = server.analyze({"purpose":"rename", "mode":"born", "surname":"林", "birthDate":"2024-04-16", "birthTime":"08:30", "place":"杭州", "length":2, "candidateCount":2, "gender":"unknown"})
        self.assertEqual(result["analysis"]["purpose"], "成人改名")
        self.assertEqual(result["analysis"]["scenario"], "已出生准确时间")
    def test_rename_purpose_rejects_due_date_flow(self):
        with self.assertRaisesRegex(ValueError, "rename purpose"):
            server.analyze({"purpose":"rename", "mode":"due_date", "surname":"林", "dueDate":"2099-01-01", "place":"杭州", "length":2, "gender":"unknown"})
    def test_timezone_is_returned_and_included_in_method(self):
        result = server.analyze({"mode":"due_date", "surname":"林", "dueDate":"2099-01-01", "place":"杭州", "zone":"Asia/Taipei", "length":2, "gender":"unknown"})
        self.assertEqual(result["analysis"]["zone"], "Asia/Taipei")
        self.assertEqual(result["analysis"]["zone_label"], "台北时间 UTC+8")
        self.assertIn("台北时间", result["analysis"]["method"])
    def test_timezone_names_do_not_change_demo_elements_or_candidates(self):
        base = {"mode":"due_date", "surname":"林", "dueDate":"2099-01-01", "dueTime":"12:00", "place":"杭州", "length":2, "gender":"unknown"}
        results = [server.analyze({**base, "zone": zone}) for zone in server.ZONE_LABELS]
        for result in results[1:]:
            self.assertEqual(result["analysis"]["primary"], results[0]["analysis"]["primary"])
            self.assertEqual(result["analysis"]["support"], results[0]["analysis"]["support"])
            self.assertEqual(result["candidates"], results[0]["candidates"])
        self.assertIn("并非四柱排盘或五行分析", results[0]["analysis"]["method"])
    def test_timezone_is_validated(self):
        with self.assertRaisesRegex(ValueError, "zone"):
            server.analyze({"mode":"due_date", "surname":"林", "dueDate":"2099-01-01", "place":"杭州", "zone":"UTC", "length":2, "gender":"unknown"})
    def test_rename_keeps_current_name_as_context(self):
        result = server.analyze({"purpose":"rename", "mode":"born", "surname":"林", "currentName":"林知远", "birthDate":"2024-04-16", "birthTime":"08:30", "place":"杭州", "length":2, "gender":"unknown"})
        self.assertEqual(result["analysis"]["current_name"], "林知远")
        self.assertIn("现用姓名为 林知远", result["analysis"]["method"])
    def test_current_name_length_is_validated(self):
        with self.assertRaisesRegex(ValueError, "currentName"):
            server.analyze({"purpose":"rename", "mode":"born", "surname":"林", "currentName":"名" * 21, "birthDate":"2024-04-16", "birthTime":"08:30", "place":"杭州", "length":2, "gender":"unknown"})
    def test_same_day_future_birth_time_is_rejected(self):
        class FrozenDateTime(server.datetime):
            @classmethod
            def now(cls, tz=None):
                return cls(2026, 4, 16, 10, 0, tzinfo=tz)
        with patch.object(server, "datetime", FrozenDateTime):
            with self.assertRaisesRegex(ValueError, "birthTime cannot"):
                server.analyze({"mode":"born", "surname":"林", "birthDate":"2026-04-16", "birthTime":"10:01", "place":"杭州", "length":2, "gender":"unknown"})

if __name__ == "__main__":
    unittest.main()
