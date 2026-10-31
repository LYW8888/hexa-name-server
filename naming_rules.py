"""Preference matching from explicitly selected reference rules, never a fate score."""

import json
import re
from functools import lru_cache
from pathlib import Path
import bazi
import tradition

VERSION = "naming-match-v2"
STYLE_LABELS = {
    "classical": "清雅古典",
    "modern": "现代简洁",
    "nature": "自然山水",
    "bright": "明朗开阔",
}
KEYWORDS = {
    "清朗": ("清", "澄", "明朗", "清澈"),
    "坚韧": ("坚定", "笃定", "持守", "柏"),
    "自然": ("自然", "山水", "桐", "柏", "川", "水"),
    "安定": ("安", "宁", "稳", "踏实"),
    "温柔": ("温", "柔", "和"),
    "开阔": ("开阔", "川", "远"),
    "明亮": ("明亮", "光明", "光亮", "昭", "煜", "烨"),
    "知行": ("知", "行", "实践", "明辨"),
    "从容": ("从容", "宁静", "平静"),
    "端正": ("端正", "分寸", "公允"),
}


@lru_cache(maxsize=1)
def catalog():
    value = json.loads(
        (Path(__file__).resolve().parent / "data" / "character-catalog.json").read_text(
            encoding="utf-8"
        )
    )
    return {item["char"]: item for item in value["characters"]}


def target_for(preference, gua, assessment=None):
    if preference == "none":
        return {
            "mode": "none",
            "element": None,
            "label": "仅日常偏好",
            "explanation": "不启用字形五行排序，四柱与起卦仍可查看。",
        }
    if preference == "yongshen":
        value = (assessment or {}).get("favorable", {})
        primary = value.get("primary")
        secondary = value.get("secondary", [])
        enabled = value.get("status") == "rule_reference" and primary is not None
        return {
            "mode": "yongshen",
            "element": primary if enabled else None,
            "secondary": secondary if enabled else [],
            "label": (
                f'扶抑喜用参考 · 用{primary} / 喜{"、".join(secondary)}'
                if enabled
                else "喜用参考暂不参与排序"
            ),
            "explanation": value.get("reason", "分析未完成。")
            + (
                " 喜用参考字形权重：用神1、喜神0.75。"
                if enabled
                else " 当前仅按日常偏好排序，请先复核格局与出生时间。"
            ),
            "review_status": value.get("status", "review_required"),
            "rule_version": (assessment or {}).get("version"),
            "review_reasons": value.get("review_reasons", []),
        }
    if preference == "auto":
        body = gua["body"]
        return {
            "mode": "auto",
            "element": body["element"],
            "label": f"体卦{body['name']} · {body['element']}意象",
            "explanation": "按本次生辰起卦的体卦五行选取字形意象；不把体卦五行当作八字喜用神。",
        }
    if preference not in bazi.ELEMENTS:
        raise ValueError("elementPreference must be auto, yongshen, none, 木, 火, 土, 金, or 水")
    return {
        "mode": "explicit",
        "element": preference,
        "label": f"自选{preference}意象",
        "explanation": "按你主动选择的字形意象排序，不推断运势。",
    }


def keyword_hits(text, item):
    requested = []
    for key in KEYWORDS:
        for match in re.finditer(re.escape(key), text):
            prefix = text[max(0, match.start() - 4) : match.start()]
            if not re.search(r"不要|避免|不喜欢", prefix):
                requested.append(key)
                break
    # Literal catalog tags also work; this is a keyword rule, not semantic AI.
    for tag in item["tags"]:
        if tag in text and not re.search(r"(?:不要|避免|不喜欢).{0,2}" + re.escape(tag), text):
            requested.append(tag)
    haystack = item["given"] + " " + item["meaning"] + " " + " ".join(item["tags"])
    return sorted(
        {key for key in requested if any(word in haystack for word in KEYWORDS.get(key, (key,)))}
    )


def rank(
    item, surname, pronunciation, chart, gua, reference, liked, family, meaning, styles, gender
):
    facts = catalog()
    glyphs = []
    for char in item["given"]:
        fact = facts.get(
            char, {"char": char, "radical": None, "element": None, "classification": "unclassified"}
        )
        glyphs.append(
            {
                **fact,
                "day_master_relation": (
                    tradition.relation(chart["day_master"]["element"], fact["element"])
                    if fact["element"]
                    else None
                ),
            }
        )
    target = reference["element"]
    criteria = []

    def add(key, label, points, possible, reason):
        if possible:
            criteria.append(
                {
                    "id": key,
                    "label": label,
                    "points": points,
                    "possible": possible,
                    "reason": reason,
                }
            )

    elements = [g["element"] for g in glyphs if g["element"]]
    if target:

        def affinity(element):
            if element == target:
                return 1
            if reference["mode"] == "yongshen":
                return 0.75 if element in reference.get("secondary", []) else 0
            return 0.5 if element and tradition.GENERATES[element] == target else 0

        similarity = sum(affinity(g["element"]) for g in glyphs) / len(glyphs)
        matching_rule = (
            "用神参考计满、喜神参考计0.75，其他与未归类不计"
            if reference["mode"] == "yongshen"
            else "同类计满，生目标计半，其他与未归类不计"
        )
        detail = "；".join(
            f"{g['char']}（{g['radical'] or '部首未收录'}）→{g['element'] or '未归类'}"
            for g in glyphs
        )
        add(
            "element",
            "字形五行意象",
            round(30 * similarity, 2),
            30,
            f"目标为{target}；{detail}。{matching_rule}；按名字字数平均。",
        )
    selected = set(styles) & set(item["styles"])
    add(
        "style",
        "风格偏好",
        20 if selected else 0,
        20 if styles else 0,
        "匹配：" + ("、".join(STYLE_LABELS.get(s, s) for s in sorted(selected)) or "暂未匹配"),
    )
    preferences = liked | family
    matched = set(item["given"]) & preferences
    if preferences:
        add(
            "characters",
            "心意用字",
            round(20 * len(matched) / len(preferences)),
            20,
            "匹配："
            + ("、".join(sorted(matched)) or "暂无")
            + "；家庭姓氏用字仅在主动启用时计入。",
        )
    words = keyword_hits(meaning, item)
    add(
        "meaning",
        "寓意关键词",
        20 if words else 0,
        20 if meaning else 0,
        "匹配：" + ("、".join(words) or "暂未匹配") + "；仅作公开关键词规则，不理解所有复杂语义。",
    )
    reading_ok = bool(pronunciation["given"]) and all(
        value["status"] == "listed" for value in pronunciation["given"]
    )
    add(
        "reading",
        "读音字典对照",
        20 if reading_ok else 0,
        20,
        "名的预设读音均在普通话单字字典中。" if reading_ok else "存在未确认的名用字读音，请复核。",
    )
    repeated = sorted(set(surname) & set(item["given"]))
    add(
        "repetition",
        "姓与名的区分",
        0 if repeated else 10,
        10,
        "姓与名有重复字：" + "".join(repeated) if repeated else "姓与名未出现相同汉字。",
    )
    if gender != "unknown":
        add(
            "gender",
            "性别偏好",
            10 if gender in item["genders"] else 0,
            10,
            "依据字库人工整理的使用倾向；不作为硬性性别限制。",
        )
    raw, possible = sum(c["points"] for c in criteria), sum(c["possible"] for c in criteria)
    score = round(raw / possible * 100)
    reasons = [f"{c['label']}：{c['reason']}" for c in criteria if c["points"] > 0]
    summary = "；".join(f"{c['label']} {c['points']}/{c['possible']}" for c in criteria)
    element_text = "；".join(
        f"{g['char']}：{g['radical'] or '部首未收录'}部→{g['element'] or '本规则未归类'}"
        + (f"，与日主为{g['day_master_relation']}" if g["element"] else "")
        for g in glyphs
    )
    return {
        "score": score,
        "characters": glyphs,
        "elements": list(dict.fromkeys(elements)),
        "ranking": {
            "version": VERSION,
            "raw_points": raw,
            "possible_points": possible,
            "criteria": criteria,
            "reasons": reasons,
            "reference": reference,
            "notice": "匹配值只用于本次条件下的候选排序，不是运势分；部首分组不等同唯一的汉字五行定论。",
        },
        "score_evidence": f"规则 {VERSION}：{summary}；有效分项合计 {raw}/{possible}，归一为 {score}。不使用预设基础分。",
        "element_evidence": element_text
        + "。仅按木、水/氵/氺、火/灬、土、金/钅/釒部首分组，不强行补足未归类字。",
        "gua_evidence": f"本次按{gua['method']}计算：上{gua['upper']['name']}下{gua['lower']['name']}，本卦{gua['hexagram']}，动第{gua['moving_line']}爻，变卦{gua['changed_hexagram']}。本次候选共用此时间起卦，按{reference['label']}匹配。",
        "yinyang_evidence": f"出生四柱表面八字：阴{sum(tradition.polarity(p[k])=='阴' for p in chart['pillars'] for k in ('stem','branch'))}、阳{sum(tradition.polarity(p[k])=='阳' for p in chart['pillars'] for k in ('stem','branch'))}；阴阳按干支属性计算。没有将待核验的姓名笔画单双当作八字平衡。",
    }
