import copy
import unittest
from collections import Counter
import bazi
import classical_sources
import mingli
import tradition


class ClassicalSourceAuditTest(unittest.TestCase):
    def test_quotes_have_pinned_provenance_and_model_parameters_remain_separate(self):
        value = classical_sources.registry()
        self.assertGreaterEqual(len(value["entries"]), 15)
        for entry in value["entries"]:
            self.assertIn(entry["quote"], classical_sources.normalize(entry["snapshot"]))
            self.assertIn(entry["commit"], entry["url"])
            self.assertEqual(entry["status"], "text_checked")
        self.assertEqual(value["model_parameters"]["status"], "project_defined")
        self.assertTrue(value["text_issues"])
        public = classical_sources.public_index()
        self.assertEqual(public["framework_status"], "text_checked")
        self.assertTrue(all("snapshot" not in source for source in public["sources"]))

    def test_fabricated_quote_changed_snapshot_or_false_parameter_verification_is_rejected(self):
        for field, text in [
            ("quote", "不存在于原文的编造引文"),
            ("snapshot", "被替换的原文"),
            ("url", "https://example.org/fake"),
        ]:
            value = copy.deepcopy(classical_sources.registry())
            value["entries"][0][field] = text
            with self.subTest(field=field), self.assertRaises(ValueError):
                classical_sources.validate(value)
        value = copy.deepcopy(classical_sources.registry())
        value["model_parameters"]["status"] = "ancient_verified"
        with self.assertRaises(ValueError):
            classical_sources.validate(value)

    def test_full_generation_and_control_tables_match_retained_passages(self):
        entries = {x["id"]: x for x in classical_sources.registry()["entries"]}
        generating = classical_sources.normalize(entries["sm-generation"]["snapshot"])
        controlling = classical_sources.normalize(entries["sm-control"]["snapshot"]).replace(
            "尅", "克"
        )
        for first, second in tradition.GENERATES.items():
            self.assertIn(first + "生" + second, generating)
        for first, second in tradition.CONTROLS.items():
            self.assertIn(first + "克" + second, controlling)
        polarity = entries["sm-polarity"]["quote"]
        self.assertIn("甲丙戊庚壬陽幹", polarity)
        self.assertIn("乙丁己辛癸陰幹", polarity)
        nature = classical_sources.normalize(entries["zy-nature"]["snapshot"])
        for text in [
            "乾為天",
            "坤為地",
            "震為雷",
            "巽為木，為風",
            "坎為水",
            "離為火",
            "艮為山",
            "兌為澤",
        ]:
            self.assertIn(text, nature)

    def test_ten_gods_match_concrete_original_examples(self):
        entries = {x["id"]: x for x in classical_sources.registry()["entries"]}
        cases = [
            ("sm-official", "甲見辛", "甲", "辛", "正官"),
            ("sm-official", "乙見庚", "乙", "庚", "正官"),
            ("sm-sha", "甲見庚", "甲", "庚", "七杀"),
            ("sm-sha", "乙見辛", "乙", "辛", "七杀"),
            ("sm-food", "甲食丙", "甲", "丙", "食神"),
            ("sm-food", "乙食丁", "乙", "丁", "食神"),
            ("sm-hurting", "甲見丁", "甲", "丁", "伤官"),
            ("sm-hurting", "乙見丙", "乙", "丙", "伤官"),
        ]
        for source, text, day, target, expected in cases:
            self.assertIn(text, entries[source]["quote"])
            self.assertEqual(tradition.ten_god(day, target), expected)


class PillarRelationsTest(unittest.TestCase):
    def chart(self):
        return bazi.calculate("2024-02-10", "12:00", "Asia/Shanghai")

    def test_eight_nodes_all_28_pairs_and_four_pillars_are_present(self):
        value = tradition.pillar_relationships(self.chart())
        self.assertEqual(len(value["nodes"]), 8)
        self.assertEqual(len(value["pairs"]), 28)
        counts = Counter(node for pair in value["pairs"] for node in (pair["from"], pair["to"]))
        self.assertEqual(set(counts.values()), {7})
        self.assertEqual({n["pillar"] for n in value["nodes"]}, {"年柱", "月柱", "日柱", "时柱"})
        inverse = {"同类": "同类", "我生": "生我", "生我": "我生", "我克": "克我", "克我": "我克"}
        for pair in value["pairs"]:
            self.assertEqual(pair["reverse"], inverse[pair["forward"]])
        years = next(p for p in value["pairs"] if p["from"] == "年干" and p["to"] == "月干")
        self.assertEqual(years["forward"], "我生")
        self.assertIn("生", years["description"])

    def test_weights_trace_relation_polarity_ten_gods_in_all_four_pillars(self):
        chart = self.chart()
        result = mingli.analyze(chart, tradition.chart_details(chart))
        s = result["strength"]
        self.assertEqual(
            {c["pillar"] for c in s["contributions"]}, {"年柱", "月柱", "日柱", "时柱"}
        )
        self.assertAlmostEqual(sum(s["relation_weights"].values()), s["total_weight"])
        self.assertAlmostEqual(
            s["relation_weights"]["同类"] + s["relation_weights"]["生我"], s["support_weight"]
        )
        hidden = next(c for c in s["contributions"] if c["pillar"] == "年柱" and c["stem"] == "癸")
        self.assertEqual(
            (hidden["day_relation"], hidden["polarity_relation"], hidden["ten_god"]),
            ("生我", "阴阳相异", "正印"),
        )
        self.assertEqual(hidden["polarity"], "阴")
        self.assertEqual(result["classical_source_status"], "text_checked")
        self.assertEqual(mingli.rules()["parameter_status"], "project_defined")

    def test_changing_year_element_changes_weight_and_year_polarity_changes_god(self):
        chart = self.chart()
        base = mingli.analyze(chart, tradition.chart_details(chart))
        changed = copy.deepcopy(chart)
        changed["pillars"][0] = bazi._pillar("年柱", "庚辰")
        result = mingli.analyze(changed, tradition.chart_details(changed))
        self.assertNotEqual(base["strength"]["support_ratio"], result["strength"]["support_ratio"])
        polarity = copy.deepcopy(chart)
        polarity["pillars"][0] = bazi._pillar("年柱", "乙辰")
        different = tradition.pillar_relationships(polarity)
        self.assertEqual(different["pillars"][0]["stem"]["ten_god"], "劫财")
        self.assertEqual(
            tradition.pillar_relationships(chart)["pillars"][0]["stem"]["ten_god"], "比肩"
        )
