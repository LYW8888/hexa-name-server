"""Declared month-pattern/Fuyi reference model, with abstention and full evidence.

Numerical parameters are project heuristics. They are not scripture quotations,
validated destiny predictions, or an expert's complete pattern judgement.
"""

from functools import lru_cache
from itertools import combinations
import json
from pathlib import Path
import bazi
import tradition


@lru_cache(maxsize=1)
def rules():
    return json.loads(
        (Path(__file__).resolve().parent / "data" / "mingli-rules.json").read_text(encoding="utf-8")
    )


LU = dict(zip(tradition.STEMS, "寅卯巳午巳午申酉亥子"))
YANG_BLADE = dict(zip("甲丙戊庚壬", "卯午午酉子"))
STEM_PAIRS = [("甲己", "土"), ("乙庚", "金"), ("丙辛", "水"), ("丁壬", "木"), ("戊癸", "火")]
TRIPLES = [
    ("三合", "申子辰", "水"),
    ("三合", "亥卯未", "木"),
    ("三合", "寅午戌", "火"),
    ("三合", "巳酉丑", "金"),
    ("三会", "亥子丑", "水"),
    ("三会", "寅卯辰", "木"),
    ("三会", "巳午未", "火"),
    ("三会", "申酉戌", "金"),
]
CLASHES = ["子午", "丑未", "寅申", "卯酉", "辰戌", "巳亥"]


def interactions(chart):
    pillars = chart["pillars"]
    result = []
    for i in range(3):
        for pair, element in STEM_PAIRS:
            if {pillars[i]["stem"], pillars[i + 1]["stem"]} == set(pair):
                result.append(
                    {
                        "kind": "天干五合",
                        "characters": pair,
                        "positions": [pillars[i]["label"], pillars[i + 1]["label"]],
                        "element_tendency": element,
                        "touches_day": i in (1, 2),
                        "note": "仅记录相邻天干合象，不判已化。",
                    }
                )
    branches = {p["branch"] for p in pillars}
    for kind, group, element in TRIPLES:
        if set(group) <= branches:
            result.append(
                {
                    "kind": kind,
                    "characters": group,
                    "positions": [p["label"] for p in pillars if p["branch"] in group],
                    "element_tendency": element,
                    "note": "仅记录三支齐备，不自动改写原始干支或权重。",
                }
            )
    for i, j in combinations(range(4), 2):
        for pair in CLASHES:
            if {pillars[i]["branch"], pillars[j]["branch"]} == set(pair):
                result.append(
                    {
                        "kind": "六冲",
                        "characters": pair,
                        "positions": [pillars[i]["label"], pillars[j]["label"]],
                        "note": "仅记录支冲，不据此推断吉凶或断定失根。",
                    }
                )
    visible = {
        tradition.ten_god(chart["day_master"]["stem"], p["stem"])
        for i, p in enumerate(pillars)
        if i != 2
    }
    for name, gods in [
        ("官杀并见", {"正官", "七杀"}),
        ("伤官见官", {"伤官", "正官"}),
        ("食神与七杀并见", {"食神", "七杀"}),
    ]:
        if gods <= visible:
            result.append(
                {
                    "kind": name,
                    "characters": "、".join(sorted(gods)),
                    "positions": [],
                    "note": "只识别透干组合，不代表已制化或成格。",
                }
            )
    return result


def pattern(chart, details):
    day_stem = chart["day_master"]["stem"]
    month = chart["pillars"][1]["branch"]
    hidden = details["pillars"][1]["hidden_stems"]
    visible = [(p["label"], p["stem"]) for i, p in enumerate(chart["pillars"]) if i != 2]
    exposed = [
        {
            "stem": h["stem"],
            "ten_god": h["ten_god"],
            "hidden_order": h["order"],
            "positions": [label for label, stem in visible if stem == h["stem"]],
        }
        for h in hidden
    ]
    exposed = [h for h in exposed if h["positions"]]
    if LU[day_stem] == month:
        label, kind, chosen, basis = (
            "建禄格参考",
            "jianlu",
            hidden[0],
            "月支为该日干禄地，单列建禄口径。",
        )
    elif YANG_BLADE.get(day_stem) == month:
        label, kind, chosen, basis = (
            "阳刃格参考",
            "yang_blade",
            hidden[0],
            "仅采用阳干羊刃表，单列阳刃口径。",
        )
    else:
        matched = next((h for h in hidden if any(stem == h["stem"] for _, stem in visible)), None)
        chosen = matched or hidden[0]
        kind = chosen["ten_god"]
        label = kind + "格参考" if kind not in ("比肩", "劫财") else "比劫当令参考"
        basis = (
            ("月令本气透干优先。" if chosen["order"] == 1 else "本气未透，按藏干顺序取先透之气。")
            if matched
            else "藏干未透，暂按月令本气列格局线索。"
        )
    return {
        "label": label,
        "kind": kind,
        "month_branch": month,
        "selected_stem": chosen["stem"],
        "selected_ten_god": chosen["ten_god"],
        "exposed": exposed,
        "basis": basis,
        "notice": "这是月令取格线索，不等同完成成格、破格、从格或化气格判断。",
    }


def season_states(month_element):
    labels = {"同类": "旺", "我生": "相", "生我": "休", "克我": "囚", "我克": "死"}
    return {e: labels[tradition.relation(month_element, e)] for e in bazi.ELEMENTS}


def _strength(chart, details, config, month_weight):
    states = season_states(details["month_main_element"])
    contributions = []
    for index, (pillar, extra) in enumerate(zip(chart["pillars"], details["pillars"])):
        values = [(pillar["stem"], 1.0, config["stem_weight"], "天干")]
        branch_weight = month_weight if index == 1 else config["branch_weight"]
        shares = config["hidden_shares"][str(len(extra["hidden_stems"]))]
        values.extend(
            (h["stem"], share, branch_weight, "藏干")
            for h, share in zip(extra["hidden_stems"], shares)
        )
        for stem, share, base, kind in values:
            element = bazi.STEM_ELEMENT[stem]
            factor = config["season_multipliers"][states[element]]
            relation = tradition.relation(chart["day_master"]["element"], element)
            contributions.append(
                {
                    "pillar": pillar["label"],
                    "kind": kind,
                    "stem": stem,
                    "element": element,
                    "polarity": tradition.polarity(stem),
                    "day_relation": relation,
                    "polarity_relation": (
                        "同阴阳"
                        if tradition.polarity(stem)
                        == tradition.polarity(chart["day_master"]["stem"])
                        else "阴阳相异"
                    ),
                    "ten_god": (
                        "日主"
                        if index == 2 and kind == "天干"
                        else tradition.ten_god(chart["day_master"]["stem"], stem)
                    ),
                    "share": share,
                    "base_weight": base,
                    "season": states[element],
                    "season_factor": factor,
                    "weight": round(base * share * factor, 6),
                    "role": "助身" if relation in ("同类", "生我") else "泄耗制",
                }
            )
    elements = {
        e: round(sum(v["weight"] for v in contributions if v["element"] == e), 6)
        for e in bazi.ELEMENTS
    }
    supportive = round(sum(v["weight"] for v in contributions if v["role"] == "助身"), 6)
    total = round(sum(elements.values()), 6)
    ratio = supportive / total
    label = (
        "偏弱"
        if ratio < config["weak_below"]
        else "偏强" if ratio > config["strong_above"] else "中和区间"
    )
    return {
        "label": label,
        "support_ratio": round(ratio, 6),
        "support_percent": round(ratio * 100, 1),
        "support_weight": supportive,
        "total_weight": total,
        "element_weights": elements,
        "season_states": states,
        "contributions": contributions,
        "relation_weights": {
            relation: round(
                sum(c["weight"] for c in contributions if c["day_relation"] == relation), 6
            )
            for relation in ("同类", "生我", "我生", "我克", "克我")
        },
    }


def favorable(chart, pattern_value, strength, review_reasons):
    by_relation = {tradition.relation(chart["day_master"]["element"], e): e for e in bazi.ELEMENTS}
    if strength["label"] == "偏弱":
        primary, secondary, reason = (
            "生我",
            "同类",
            "扶抑参考：偏弱先取印星生扶，同类比劫作为辅助；不按五行缺项补字。",
        )
    elif strength["label"] == "偏强":
        kind = pattern_value["kind"]
        if kind in ("jianlu", "yang_blade", "正官", "七杀"):
            primary, secondary, reason = (
                "克我",
                "我克",
                "本规则对建禄、阳刃或官杀线索的偏强盘，优先参考官杀制身，以财星为辅助。",
            )
        elif kind in ("正印", "偏印", "食神", "伤官", "正财", "偏财"):
            primary, secondary, reason = (
                "我克",
                "我生",
                "本规则对印、食伤或财格线索的偏强盘，参考财星耗身、食伤泄身；未判断完整成格制化。",
            )
        else:
            primary, secondary, reason = (
                "我生",
                "我克",
                "扶抑参考：偏强参考食伤泄身，以财星耗身为辅助。",
            )
    else:
        return {
            "status": "no_single_choice",
            "label": "暂不指定单一喜用",
            "primary": None,
            "secondary": [],
            "proposed": None,
            "reason": "本规则处于中和区间，不按少一行或最低权重强选用神。",
            "review_reasons": review_reasons,
            "notice": "选字方向结合月令、日主生克与扶抑方法整理；引用和计算过程可展开查看。",
        }
    proposed = {
        "primary": by_relation[primary],
        "secondary": [by_relation[secondary]],
        "primary_relation": primary,
        "secondary_relation": secondary,
    }
    guarded = bool(review_reasons)
    return {
        "status": "review_required" if guarded else "rule_reference",
        "label": "综合选字方向" if guarded else "扶抑喜用参考",
        "primary": None if guarded else proposed["primary"],
        "secondary": [] if guarded else proposed["secondary"],
        "proposed": proposed,
        "reason": reason,
        "review_reasons": review_reasons,
        "notice": "选字方向结合月令、日主生克与扶抑方法整理；引用和计算过程可展开查看。",
    }


def analyze(chart, details):
    config = rules()
    value = pattern(chart, details)
    links = interactions(chart)
    strength = _strength(chart, details, config, config["month_branch_weight"])
    variants = [
        {
            "month_weight": w,
            **{
                k: v
                for k, v in _strength(chart, details, config, w).items()
                if k in ("label", "support_ratio")
            },
        }
        for w in config["sensitivity_month_weights"]
    ]
    roots = [
        {
            "pillar": p["label"],
            "branch": p["branch"],
            "stems": [
                h["stem"]
                for h in d["hidden_stems"]
                if h["element"] == chart["day_master"]["element"]
            ],
        }
        for p, d in zip(chart["pillars"], details["pillars"])
    ]
    roots = [r for r in roots if r["stems"]]
    strength.update(
        {
            "roots": roots,
            "root_definition": "地支藏干中出现日主同五行，分项权重已计入，不再叠加根气加分。",
            "month_state": strength["season_states"][chart["day_master"]["element"]],
            "sensitivity": variants,
            "thresholds": {
                "weak_below": config["weak_below"],
                "strong_above": config["strong_above"],
            },
        }
    )
    ratio = strength["support_ratio"]
    reviews = []
    if ratio <= config["special_extreme_below"] or ratio >= config["special_extreme_above"]:
        reviews.append("助身比例极端，需排查从格或专旺，普通扶抑不自动适用。")
    if any(
        abs(ratio - limit) <= config["threshold_margin"]
        for limit in (config["weak_below"], config["strong_above"])
    ):
        reviews.append("强弱接近阈值，小幅参数或出生时间变化可能改变判断。")
    if len({v["label"] for v in variants}) > 1:
        reviews.append("月支权重敏感性检查出现不同强弱标签。")
    if any(x["kind"] in ("三合", "三会") or x.get("touches_day") for x in links):
        reviews.append("存在三合/三会齐备或日干参与的相邻天干五合，需人工复核合化。")
    if any(x["kind"] in ("官杀并见", "伤官见官", "食神与七杀并见") for x in links):
        reviews.append("存在透干组合，需要复核制化，不能只按强弱指定喜用。")
    if chart.get("boundary") or chart.get("time_correction", {}).get("near_hour_boundary"):
        reviews.append("靠近节气或所选钟面的时辰边界，应先确认时间再取用。")
    return {
        "version": config["version"],
        "method": config["method"],
        "verification_status": config["verification_status"],
        "reference": chart.get("reference", False),
        "classical_source_status": config["classical_source_status"],
        "parameter_status": config["parameter_status"],
        "weight_origin": config["weight_origin"],
        "pattern": value,
        "strength": strength,
        "interactions": links,
        "favorable": favorable(chart, value, strength, reviews),
        "parameters": {
            k: config[k]
            for k in (
                "stem_weight",
                "branch_weight",
                "month_branch_weight",
                "hidden_shares",
                "season_multipliers",
                "weak_below",
                "strong_above",
                "threshold_margin",
                "special_extreme_below",
                "special_extreme_above",
                "sensitivity_month_weights",
            )
        },
        "notes": config["notes"],
        "notice": "按月令与四柱生克分析；传统规则引用和序名分析参数分别记录，便于核对与比较。",
    }
