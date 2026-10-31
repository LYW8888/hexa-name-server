import unittest
import server

BASE = dict(purpose="rename", mode="born", surname="李", currentName="李景和", birthDate="1998-08-13", birthTime="13:48", place="河南南阳")

class WorkflowTest(unittest.TestCase):
    def test_rename_review_returns_existing_name_report_without_recommendations(self):
        value = server.review_name(BASE)
        analysis = value["analysis"]
        self.assertEqual(value["candidates"], [])
        self.assertEqual(analysis["phase"], "name_review")
        self.assertEqual(analysis["purpose_code"], "rename")
        self.assertEqual(analysis["workflow"]["id"], "rename")
        self.assertEqual(analysis["purpose"], "改名方案")
        self.assertEqual(analysis["name_review"]["full_name"], "李景和")
        self.assertEqual(analysis["name_review"]["character_count"], 2)
        self.assertEqual(len(analysis["name_review"]["findings"]), 5)
        self.assertEqual(len(analysis["bazi"]["pillars"]), 4)
        self.assertFalse(analysis["gua"]["reference"])

    def test_rename_requires_real_full_name_and_matching_surname(self):
        for name in ("", "李", "景和", "王景和", "李a", "李😀", "李" * 21):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "currentName"):
                server.analyze({**BASE, "currentName":name})
        value = server.review_name({**BASE, "surname":"欧阳", "currentName":"欧阳安"})
        self.assertEqual(value["analysis"]["name_review"]["given"], "安")

    def test_review_is_only_for_rename_and_actual_birth(self):
        for changes in ({"purpose":"newborn"}, {"mode":"due_date","dueDate":"2099-01-01"}, {"birthTime":""}, {"birthDate":"2099-01-01"}, {"dueDate":"2099-01-01"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                server.review_name({**BASE, **changes})

    def test_original_name_is_never_a_recommendation_in_any_group(self):
        value = server.analyze({**BASE,"candidateCount":11})
        count = value["analysis"]["available_candidate_count"]
        self.assertEqual(count,29)
        for variant in range(4):
            value = server.analyze({**BASE,"candidateCount":11,"variant":variant})
            for item in value["candidates"]:
                self.assertNotEqual(item["name"], BASE["currentName"])
                self.assertEqual(item["rename_comparison"]["original_name"], BASE["currentName"])
                self.assertEqual(item["rename_comparison"]["new_name"], item["name"])

    def test_original_analysis_stable_when_recommendation_preferences_change(self):
        first = server.review_name(BASE)["analysis"]["name_review"]
        second = server.analyze({**BASE,"elementPreference":"水","likedChars":"清","styles":["nature"]})["analysis"]["name_review"]
        self.assertEqual(first,second)
        changed = server.review_name({**BASE,"birthTime":"23:48"})["analysis"]["name_review"]
        self.assertNotEqual(first["findings"][-1],changed["findings"][-1])

    def test_unlisted_characters_do_not_get_invented_meaning_or_element(self):
        review = server.review_name({**BASE,"currentName":"李龘"})["analysis"]["name_review"]
        self.assertIsNone(review["meaning"])
        self.assertEqual(review["characters"][0]["char"], "龘")
        self.assertIsNone(review["characters"][0]["element"])
        self.assertEqual(review["classified_count"],0)
        self.assertNotIn("score",review)

    def test_newborn_never_inherits_rename_name_or_report(self):
        value = server.analyze({**BASE,"purpose":"newborn"})
        self.assertEqual(value["analysis"]["current_name"],"")
        self.assertIsNone(value["analysis"]["name_review"])
        self.assertTrue(all("rename_comparison" not in x for x in value["candidates"]))
        self.assertEqual(value["analysis"]["workflow"]["id"], "newborn_born")

    def test_review_reports_repeat_and_dictionary_ambiguity_as_observations(self):
        review = server.review_name({**BASE,"surname":"单","currentName":"单单安"})["analysis"]["name_review"]
        self.assertIn("单",review["pronunciation"]["surname_given_overlap"])
        self.assertIn("多个字典读音",review["findings"][1]["detail"])
        self.assertIn("姓与名重复",review["findings"][2]["detail"])

    def test_future_recommendation_filters_do_not_block_original_analysis(self):
        base = server.review_name(BASE)["analysis"]["name_review"]
        changed = server.review_name({**BASE,"likedChars":"安","avoidedChars":"安","candidateCount":999,"length":9,"styles":"invalid","elementPreference":"invalid"})
        self.assertEqual(changed["analysis"]["name_review"],base)
        self.assertEqual(changed["candidates"],[])
        with self.assertRaises(ValueError):
            server.analyze({**BASE,"likedChars":"安","avoidedChars":"安"})
