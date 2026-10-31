import unittest
import bazi
import mingli
import tradition
import naming_rules
import server


def chart_for(values):
    pillars = [
        bazi._pillar(label, value)
        for label, value in zip(("年柱", "月柱", "日柱", "时柱"), values.split())
    ]
    return {
        "pillars": pillars,
        "day_master": {"stem": pillars[2]["stem"], "element": pillars[2]["stem_element"]},
    }


class MingliRulesTest(unittest.TestCase):
    def test_weighted_anchor_has_hand_computed_total_and_support(self):
        chart = bazi.calculate("2024-02-10", "12:00", "Asia/Shanghai")
        result = mingli.analyze(chart, tradition.chart_details(chart))
        s = result["strength"]
        self.assertEqual(result["pattern"]["kind"], "jianlu")
        self.assertAlmostEqual(s["total_weight"], 13.985)
        self.assertAlmostEqual(s["support_weight"], 7.82)
        self.assertAlmostEqual(s["support_ratio"], 7.82 / 13.985, places=6)
        self.assertEqual(s["label"], "中和区间")
        self.assertEqual(result["favorable"]["status"], "no_single_choice")
        self.assertIsNone(result["favorable"]["primary"])
        self.assertEqual(sum(s["element_weights"].values()), s["total_weight"])
        self.assertNotEqual(s["total_weight"], sum(chart["element_counts"].values()))

    def test_month_qi_exposure_main_then_other_then_unexposed(self):
        for text, expected in [
            ("甲子 丙寅 庚午 戊辰", "偏财"),
            ("戊辰 丙寅 庚午 癸未", "七杀"),
            ("壬子 丁寅 庚午 癸未", "偏财"),
        ]:
            chart = chart_for(text)
            value = mingli.pattern(chart, tradition.chart_details(chart))
            self.assertEqual(value["kind"], expected)
        chart = chart_for("戊辰 丙寅 庚午 癸未")
        result = mingli.pattern(chart, tradition.chart_details(chart))
        self.assertEqual(result["selected_stem"], "丙")
        self.assertIn("余气", mingli.rules()["notes"][3])

    def test_jianlu_and_yang_blade_are_separate_and_yin_blade_not_invented(self):
        for values, expected in [
            ("甲辰 丙寅 甲辰 庚午", "jianlu"),
            ("甲辰 丙午 戊辰 庚午", "yang_blade"),
        ]:
            chart = chart_for(values)
            self.assertEqual(
                mingli.pattern(chart, tradition.chart_details(chart))["kind"], expected
            )
        self.assertEqual(set(mingli.YANG_BLADE), set("甲丙戊庚壬"))

    def test_spring_month_season_states_and_hidden_shares(self):
        self.assertEqual(
            mingli.season_states("木"), {"木": "旺", "火": "相", "土": "死", "金": "囚", "水": "休"}
        )
        for shares in mingli.rules()["hidden_shares"].values():
            self.assertAlmostEqual(sum(shares), 1)

    def test_weak_and_strong_fuyi_directions(self):
        chart = {"day_master": {"element": "木"}}
        weak = mingli.favorable(chart, {"kind": "正财"}, {"label": "偏弱"}, [])
        self.assertEqual((weak["primary"], weak["secondary"]), ("水", ["木"]))
        strong = mingli.favorable(chart, {"kind": "jianlu"}, {"label": "偏强"}, [])
        self.assertEqual((strong["primary"], strong["secondary"]), ("金", ["土"]))
        strong_print = mingli.favorable(chart, {"kind": "正印"}, {"label": "偏强"}, [])
        self.assertEqual((strong_print["primary"], strong_print["secondary"]), ("土", ["火"]))
        for element in bazi.ELEMENTS:
            candidate = mingli.favorable(
                {"day_master": {"element": element}}, {"kind": "正财"}, {"label": "偏弱"}, []
            )
            self.assertEqual(tradition.GENERATES[candidate["primary"]], element)

    def test_combinations_are_reported_without_automatic_transformation(self):
        chart = chart_for("甲申 己子 甲辰 己巳")
        value = mingli.analyze(chart, tradition.chart_details(chart))
        self.assertTrue(
            any(x["kind"] == "三合" and x["characters"] == "申子辰" for x in value["interactions"])
        )
        self.assertTrue(any(x["kind"] == "天干五合" for x in value["interactions"]))
        self.assertEqual(chart["pillars"][2]["stem"], "甲")
        self.assertIsNone(value["favorable"]["primary"])
        self.assertTrue(value["favorable"]["review_reasons"])

    def test_extreme_strength_and_boundaries_require_review(self):
        chart = chart_for("甲寅 甲寅 甲子 甲寅")
        extreme = mingli.analyze(chart, tradition.chart_details(chart))
        self.assertGreater(extreme["strength"]["support_ratio"], 0.8)
        self.assertEqual(extreme["favorable"]["status"], "review_required")
        self.assertIsNone(extreme["favorable"]["primary"])
        boundary = bazi.calculate("2024-02-04", "16:27", "Asia/Shanghai")
        result = mingli.analyze(boundary, tradition.chart_details(boundary))
        self.assertTrue(any("边界" in x for x in result["favorable"]["review_reasons"]))
        self.assertIsNone(result["favorable"]["primary"])

    def test_contribution_and_favorable_status_invariants_over_a_year(self):
        statuses = set()
        for month in range(1, 13):
            for day in (1, 10, 20):
                chart = bazi.calculate(f"2024-{month:02}-{day:02}", "12:00", "Asia/Shanghai")
                result = mingli.analyze(chart, tradition.chart_details(chart))
                s = result["strength"]
                statuses.add(result["favorable"]["status"])
                self.assertAlmostEqual(
                    sum(c["weight"] for c in s["contributions"]), s["total_weight"]
                )
                self.assertAlmostEqual(
                    sum(c["weight"] for c in s["contributions"] if c["role"] == "助身"),
                    s["support_weight"],
                )
                self.assertGreaterEqual(s["support_ratio"], 0)
                self.assertLessEqual(s["support_ratio"], 1)
                if result["favorable"]["status"] != "rule_reference":
                    self.assertIsNone(result["favorable"]["primary"])
                self.assertEqual(result["classical_source_status"], "pending")
        self.assertEqual(statuses, {"rule_reference", "review_required", "no_single_choice"})

    def test_favorable_ranking_does_not_treat_gua_as_yongshen(self):
        assessment = {
            "version": "test",
            "favorable": {
                "status": "rule_reference",
                "primary": "水",
                "secondary": ["木"],
                "reason": "测试扶抑规则",
                "review_reasons": [],
            },
        }
        reference = naming_rules.target_for(
            "yongshen", {"body": {"name": "离", "element": "火"}}, assessment
        )
        self.assertEqual(reference["element"], "水")
        self.assertEqual(reference["secondary"], ["木"])
        held = naming_rules.target_for(
            "yongshen",
            {},
            {
                "favorable": {
                    "status": "review_required",
                    "primary": None,
                    "reason": "需复核",
                    "review_reasons": ["合化"],
                }
            },
        )
        self.assertIsNone(held["element"])
        chart = bazi.calculate("2024-02-10", "12:00", "Asia/Shanghai")
        gua = tradition.cast("2024-02-10", "12:00", "Asia/Shanghai")
        item = next(n for n in server.load_names() if n["given"] == "桐")
        pronunciation = server.phonetics.check("林", item["given"], item["pinyin"])
        result = naming_rules.rank(
            item, "林", pronunciation, chart, gua, reference, set(), set(), "", [], "unknown"
        )
        points = next(c["points"] for c in result["ranking"]["criteria"] if c["id"] == "element")
        self.assertEqual(points, 22.5)  # 30 * .75; name's wood is the declared secondary.
        item = next(n for n in server.load_names() if n["given"] == "钧")
        result = naming_rules.rank(
            item,
            "林",
            server.phonetics.check("林", "钧", item["pinyin"]),
            chart,
            gua,
            reference,
            set(),
            set(),
            "",
            [],
            "unknown",
        )
        self.assertEqual(
            next(c["points"] for c in result["ranking"]["criteria"] if c["id"] == "element"), 0
        )  # Metal generates water but is not a declared favourable element.
