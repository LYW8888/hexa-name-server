import unittest
import bazi
import tradition
import naming_rules
import server


class TraditionalRulesTest(unittest.TestCase):
    def test_ten_gods_known_jia_and_yi_relations(self):
        self.assertEqual(
            [tradition.ten_god("甲", x) for x in tradition.STEMS],
            ["比肩", "劫财", "食神", "伤官", "偏财", "正财", "七杀", "正官", "偏印", "正印"],
        )
        self.assertEqual(
            [tradition.ten_god("乙", x) for x in tradition.STEMS],
            ["劫财", "比肩", "伤官", "食神", "正财", "偏财", "正官", "七杀", "正印", "偏印"],
        )
        for stem in tradition.STEMS:
            self.assertEqual(
                len({tradition.ten_god(stem, target) for target in tradition.STEMS}), 10
            )

    def test_all_element_relations_and_polarity_tables(self):
        expected = {
            "木": ["同类", "我生", "我克", "克我", "生我"],
            "火": ["生我", "同类", "我生", "我克", "克我"],
            "土": ["克我", "生我", "同类", "我生", "我克"],
            "金": ["我克", "克我", "生我", "同类", "我生"],
            "水": ["我生", "我克", "克我", "生我", "同类"],
        }
        for first, values in expected.items():
            self.assertEqual(
                [tradition.relation(first, second) for second in bazi.ELEMENTS], values
            )
        for value in ("甲丙戊庚壬", "子寅辰午申戌"):
            self.assertTrue(all(tradition.polarity(x) == "阳" for x in value))
        for value in ("乙丁己辛癸", "丑卯巳未酉亥"):
            self.assertTrue(all(tradition.polarity(x) == "阴" for x in value))

    def test_known_chart_hidden_stems_and_counts_are_distinct(self):
        chart = bazi.calculate("2024-02-10", "12:00", "Asia/Shanghai")
        result = tradition.chart_details(chart)
        self.assertEqual([p["ganzhi"] for p in chart["pillars"]], ["甲辰", "丙寅", "甲辰", "庚午"])
        self.assertEqual(result["polarity_counts"], {"阴": 0, "阳": 8})
        self.assertEqual(
            [h["stem"] for h in result["pillars"][0]["hidden_stems"]], ["戊", "乙", "癸"]
        )
        self.assertEqual(
            [p["ten_god"] for p in result["pillars"]], ["比肩", "食神", "日主", "七杀"]
        )
        self.assertEqual(
            result["hidden_element_counts"], {"木": 3, "火": 2, "土": 4, "金": 0, "水": 2}
        )
        self.assertEqual(sum(chart["element_counts"].values()), 8)
        self.assertNotEqual(sum(result["hidden_element_counts"].values()), 8)

    def test_lunar_new_year_meng_to_bo_anchor_and_reverse(self):
        result = tradition.cast("2024-02-10", "12:00", "Asia/Shanghai")
        self.assertEqual(
            result["inputs"],
            {
                "lunar_year": 2024,
                "year_branch": "辰",
                "year_branch_number": 5,
                "lunar_month": 1,
                "leap_month": False,
                "lunar_day": 1,
                "hour_branch": "午",
                "hour_branch_number": 7,
            },
        )
        self.assertEqual(
            (
                result["upper"]["name"],
                result["lower"]["name"],
                result["hexagram"],
                result["moving_line"],
                result["changed_hexagram"],
            ),
            ("艮", "坎", "蒙", 2, "剥"),
        )
        self.assertEqual((result["body"]["element"], result["body_use_relation"]), ("土", "我克"))
        midnight = tradition.cast("2024-02-10", "00:00", "Asia/Shanghai")
        self.assertEqual(
            (midnight["hexagram"], midnight["moving_line"], midnight["changed_hexagram"]),
            ("剥", 2, "蒙"),
        )
        self.assertEqual(midnight["arithmetic"]["lower_remainder"], 0)

    def test_lunar_year_not_confused_with_lichun_year_or_late_zi_day(self):
        result = tradition.cast("2024-02-05", "12:00", "Asia/Shanghai")
        self.assertEqual(result["inputs"]["year_branch"], "卯")
        self.assertEqual(
            bazi.calculate("2024-02-05", "12:00", "Asia/Shanghai")["pillars"][0]["ganzhi"], "甲辰"
        )
        early = tradition.cast("2024-02-10", "22:59", "Asia/Shanghai")
        late = tradition.cast("2024-02-10", "23:00", "Asia/Shanghai")
        self.assertEqual(early["inputs"]["lunar_day"], late["inputs"]["lunar_day"])
        self.assertEqual(late["inputs"]["hour_branch_number"], 1)
        self.assertTrue(
            tradition.cast("2023-03-22", "12:00", "Asia/Shanghai")["inputs"]["leap_month"]
        )

    def test_64_unique_hexagrams_and_single_moving_line_across_samples(self):
        self.assertEqual(len({x for row in tradition.HEXAGRAMS for x in row}), 64)
        for day in range(1, 29):
            for hour in ("00:00", "04:00", "12:00", "20:00"):
                value = tradition.cast(f"2024-03-{day:02}", hour, "Asia/Shanghai")
                changed = [
                    i + 1
                    for i, (a, b) in enumerate(zip(value["lines"], value["changed_lines"]))
                    if a != b
                ]
                self.assertEqual(changed, [value["moving_line"]])
                self.assertEqual(value["lines"][:3], value["lower"]["lines"])
                self.assertEqual(value["lines"][3:], value["upper"]["lines"])
                body = value["upper"] if value["moving_line"] <= 3 else value["lower"]
                self.assertEqual(value["body"], body)


class NamingRankingTest(unittest.TestCase):
    base = {
        "surname": "林",
        "mode": "born",
        "birthDate": "2024-02-10",
        "birthTime": "12:00",
        "place": "杭州",
        "length": 2,
        "candidateCount": 3,
    }

    def analyze(self, **extra):
        return server.analyze({**self.base, **extra})

    def test_five_preferences_change_names_using_radicals(self):
        winners = []
        for element in bazi.ELEMENTS:
            result = self.analyze(elementPreference=element)
            winners.append(result["candidates"][0]["given"])
            for item in result["candidates"]:
                self.assertIn(element, item["elements"])
                self.assertIn("部", item["element_evidence"])
                parts = item["ranking"]
                self.assertEqual(
                    item["score"], round(parts["raw_points"] / parts["possible_points"] * 100)
                )
                self.assertNotIn("base_score", item)
        self.assertEqual(len(set(winners)), 5)

    def test_time_changes_gua_and_default_ranking(self):
        first = self.analyze()
        second = self.analyze(birthDate="2024-02-13")
        self.assertNotEqual(
            first["analysis"]["gua"]["hexagram"], second["analysis"]["gua"]["hexagram"]
        )
        self.assertNotEqual(
            first["analysis"]["naming_reference"]["element"],
            second["analysis"]["naming_reference"]["element"],
        )
        self.assertNotEqual(first["candidates"][0]["given"], second["candidates"][0]["given"])

    def test_flows_never_override_each_others_time(self):
        with self.assertRaisesRegex(ValueError, "due date flow"):
            self.analyze(mode="due_date", dueDate="2099-12-23")
        actual = self.analyze()
        due = server.analyze({"surname":"林", "mode":"due_date", "dueDate":"2099-12-23", "place":"杭州"})
        self.assertFalse(actual["analysis"]["gua"]["reference"])
        self.assertTrue(due["analysis"]["gua"]["reference"])

    def test_reference_can_be_disabled_without_hiding_chart(self):
        result = self.analyze(elementPreference="none")
        self.assertIsNone(result["analysis"]["naming_reference"]["element"])
        self.assertTrue(result["analysis"]["traditional"])
        self.assertTrue(result["analysis"]["gua"])
        self.assertTrue(
            all(
                "element" not in [c["id"] for c in n["ranking"]["criteria"]]
                for n in result["candidates"]
            )
        )
        with self.assertRaisesRegex(ValueError, "elementPreference"):
            self.analyze(elementPreference="guess")

    def test_family_characters_require_opt_in_and_avoid_always_wins(self):
        base = self.analyze(elementPreference="none", parents="安")
        opted = self.analyze(elementPreference="none", parents="安", honorParents=True)
        self.assertNotEqual(base["candidates"], opted["candidates"])
        self.assertTrue(all("安" in x["given"] for x in opted["candidates"]))
        avoided = self.analyze(
            elementPreference="none", parents="安", honorParents=True, avoidedChars="安"
        )
        self.assertTrue(all("安" not in x["given"] for x in avoided["candidates"]))

    def test_unclassified_characters_and_pending_sources_are_honest(self):
        facts = naming_rules.catalog()
        self.assertIsNone(facts["安"]["element"])
        self.assertEqual(facts["桐"]["element"], "木")
        self.assertEqual(facts["沐"]["element"], "水")
        self.assertTrue(
            all(
                n["meaning_source"]["verification_status"] == "pending" for n in server.load_names()
            )
        )
        self.assertTrue(
            all("demo_associations" not in n and "base_score" not in n for n in server.load_names())
        )
