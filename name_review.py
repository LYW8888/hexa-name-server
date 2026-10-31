"""Explain an existing name with the same recorded facts used for recommendations."""
from collections import Counter
import naming_rules
import phonetics
import tradition


def validate(surname, full_name):
    if (not isinstance(full_name, str) or not len(surname) < len(full_name) <= 20
            or not full_name.startswith(surname)
            or not all(phonetics.is_han(char) for char in full_name)):
        raise ValueError("currentName must be a full Chinese name starting with surname, with a given name, up to 20 characters")


def build(surname, full_name, chart, reference, names):
    given = full_name[len(surname):]
    reading = phonetics.default_reading(given)
    pronunciation = phonetics.check(surname, given, reading)
    facts = naming_rules.catalog()
    glyphs = []
    for char in given:
        fact = facts.get(char, {"char": char, "radical": None, "element": None})
        glyphs.append({"char": char, "radical": fact.get("radical"), "element": fact.get("element"),
                       "day_master_relation": tradition.relation(chart["day_master"]["element"], fact["element"]) if fact.get("element") else None})
    listed = next((item for item in names if item["given"] == given), None)
    polyphonic = list(dict.fromkeys(p["character"] for p in pronunciation["surname"] + pronunciation["given"] if len(p["readings"]) > 1))
    unknown = list(dict.fromkeys(p["character"] for p in pronunciation["given"] if p["status"] == "unknown"))
    repeated = [char for char, count in Counter(given).items() if count > 1]
    overlap = pronunciation["surname_given_overlap"]
    classified = [g for g in glyphs if g["element"]]
    findings = [
        {"id": "structure", "title": "姓名结构", "detail": f"姓氏{surname}，名{given}；全名{len(full_name)}字，名{len(given)}字。"},
        {"id": "reading", "title": "普通话读音", "detail": (f"名的字典参考读音：{reading}。" if reading else "名中有未收录读音的字。") + (f"{'、'.join(polyphonic)}有多个字典读音，实际使用以本人读法为准。" if polyphonic else "已收录的名用字均只有一个字典读音。") + (f"{'、'.join(unknown)}的读音暂未收录。" if unknown else "")},
        {"id": "distinction", "title": "姓与名的区分", "detail": (f"姓与名重复：{'、'.join(overlap)}。" if overlap else "姓与名没有相同汉字。") + (f"名内重复：{'、'.join(repeated)}；叠字是风格选择。" if repeated else "名内没有重复汉字。")},
        {"id": "glyph", "title": "字形五行依据", "detail": "；".join(f"{g['char']}：{g['radical'] or '部首未收录'}部，{g['element'] or '本规则未归类'}" + (f"，相对日主{g['day_master_relation']}" if g['element'] else "") for g in glyphs) + f"。已归类{len(classified)}/{len(glyphs)}字；采用公开部首分组，未归类字不视为缺失五行。"},
        {"id": "birth", "title": "出生四柱与选字方向", "detail": f"实际出生{chart['local_time']}；" + "、".join(f"{p['label']}{p['ganzhi']}" for p in chart['pillars']) + f"。日主{chart['day_master']['stem']}（{chart['day_master']['element']}）；{reference['label']}。"},
    ]
    directions = ["保留姓氏，候选中排除现用全名；结合读音、字形和个人期望比较新方案。"]
    if polyphonic:
        directions.append("若希望减少读音解释，可优先比较单一读音用字。")
    if overlap or repeated:
        directions.append("若希望姓与名区分更清楚，可优先比较不含重复字的方案。")
    if reference.get("element"):
        directions.append(f"本次可比较{reference['element']}意象用字，并查看每个字的部首与日主关系。")
    return {"version": "existing-name-v1", "full_name": full_name, "surname": surname, "given": given,
            "pinyin": reading, "pronunciation": pronunciation, "characters": glyphs,
            "element_counts": dict(Counter(g['element'] for g in classified)),
            "classified_count": len(classified), "character_count": len(glyphs),
            "meaning": listed["meaning"] if listed else None,
            "meaning_source": listed["meaning_source"] if listed else None,
            "findings": findings, "directions": directions,
            "notice": "现名分析说明可核对的读音、字形和出生依据，不据此认定原名吉凶，也不承诺改名改变运势。"}


def compare(review, candidate):
    before, after = review["given"], candidate["given"]
    return {"original_name": review["full_name"], "new_name": review["surname"] + after,
            "retained_characters": list(dict.fromkeys(char for char in after if char in before)),
            "new_characters": list(dict.fromkeys(char for char in after if char not in before)),
            "detail": f"名由“{before}”调整为“{after}”；{len(before)}字名 → {len(after)}字名。出生四柱不随改名改变。"}
