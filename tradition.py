"""Reproducible cultural rules; no strength, favourable-element or fate claims."""

from collections import Counter
from lunar_python import Solar
from lunar_python.util import LunarUtil
import bazi

VERSION = "traditional-reference-v1"
GENERATES = dict(zip(bazi.ELEMENTS, ("火", "土", "金", "水", "木")))
CONTROLS = dict(zip(bazi.ELEMENTS, ("土", "金", "水", "木", "火")))
STEMS = "甲乙丙丁戊己庚辛壬癸"
BRANCHES = "子丑寅卯辰巳午未申酉戌亥"
# Bottom-to-top line order; the numeric order is the declared Xiantian order.
TRIGRAMS = [
    ("乾", "天", "金", (1, 1, 1)),
    ("兑", "泽", "金", (1, 1, 0)),
    ("离", "火", "火", (1, 0, 1)),
    ("震", "雷", "木", (1, 0, 0)),
    ("巽", "风", "木", (0, 1, 1)),
    ("坎", "水", "水", (0, 1, 0)),
    ("艮", "山", "土", (0, 0, 1)),
    ("坤", "地", "土", (0, 0, 0)),
]
# Each row has a fixed upper trigram; columns use the same lower-trigram order.
HEXAGRAMS = [
    ["乾", "履", "同人", "无妄", "姤", "讼", "遁", "否"],
    ["夬", "兑", "革", "随", "大过", "困", "咸", "萃"],
    ["大有", "睽", "离", "噬嗑", "鼎", "未济", "旅", "晋"],
    ["大壮", "归妹", "丰", "震", "恒", "解", "小过", "豫"],
    ["小畜", "中孚", "家人", "益", "巽", "涣", "渐", "观"],
    ["需", "节", "既济", "屯", "井", "坎", "蹇", "比"],
    ["大畜", "损", "贲", "颐", "蛊", "蒙", "艮", "剥"],
    ["泰", "临", "明夷", "复", "升", "师", "谦", "坤"],
]


def polarity(character):
    sequence = STEMS if character in STEMS else BRANCHES
    return "阳" if sequence.index(character) % 2 == 0 else "阴"


def relation(first, second):
    if first == second:
        return "同类"
    if GENERATES[first] == second:
        return "我生"
    if GENERATES[second] == first:
        return "生我"
    if CONTROLS[first] == second:
        return "我克"
    return "克我"


def ten_god(day_stem, target):
    same = polarity(day_stem) == polarity(target)
    return {
        "同类": ("比肩", "劫财"),
        "我生": ("食神", "伤官"),
        "生我": ("偏印", "正印"),
        "我克": ("偏财", "正财"),
        "克我": ("七杀", "正官"),
    }[relation(bazi.STEM_ELEMENT[day_stem], bazi.STEM_ELEMENT[target])][0 if same else 1]


def chart_details(chart):
    day_stem = chart["day_master"]["stem"]
    polarity_counts = Counter()
    hidden_counts = Counter()
    details = []
    for pillar in chart["pillars"]:
        stem, branch = pillar["stem"], pillar["branch"]
        stem_polarity, branch_polarity = polarity(stem), polarity(branch)
        polarity_counts.update((stem_polarity, branch_polarity))
        hidden = []
        for index, character in enumerate(LunarUtil.ZHI_HIDE_GAN[branch]):
            element = bazi.STEM_ELEMENT[character]
            hidden_counts[element] += 1
            hidden.append(
                {
                    "stem": character,
                    "element": element,
                    "polarity": polarity(character),
                    "ten_god": ten_god(day_stem, character),
                    "order": index + 1,
                }
            )
        details.append(
            {
                "label": pillar["label"],
                "stem_polarity": stem_polarity,
                "branch_polarity": branch_polarity,
                "ten_god": "日主" if pillar["label"] == "日柱" else ten_god(day_stem, stem),
                "hidden_stems": hidden,
            }
        )
    return {
        "version": VERSION,
        "polarity_counts": {key: polarity_counts[key] for key in ("阴", "阳")},
        "pillars": details,
        "hidden_element_counts": {element: hidden_counts[element] for element in bazi.ELEMENTS},
        "month_main_element": details[1]["hidden_stems"][0]["element"],
        "notes": [
            "阴阳按十天干、十二地支的固定阴阳属性逐项计数，共八项。",
            "藏干顺序沿用 lunar_python 1.4.8 的地支藏干表，未赋旺衰权重；藏干次数不能与表面八字次数混为强弱。",
            "十神由日干与其他天干的五行生克及阴阳同异计算；这是关系名称，不是吉凶评分。",
            "未计算格局、调候、用神或大运，不按缺哪一行就补哪一行起名。",
        ],
        "source": {
            "library": "lunar_python",
            "version": "1.4.8",
            "table": "LunarUtil.ZHI_HIDE_GAN",
            "license": "MIT",
        },
    }


def trigram(index):
    name, image, element, lines = TRIGRAMS[index]
    return {
        "number": index + 1,
        "name": name,
        "image": image,
        "element": element,
        "lines": list(lines),
    }


def cast(date_text, time_text, zone_name, reference=False):
    local = bazi._local_moment(date_text, time_text, zone_name)
    lunar = Solar.fromYmdHms(
        local.year, local.month, local.day, local.hour, local.minute, 0
    ).getLunar()
    year_number, month, day = lunar.getYearZhiIndex() + 1, abs(lunar.getMonth()), lunar.getDay()
    hour_number = ((local.hour + 1) // 2) % 12 + 1
    subtotal, total = year_number + month + day, year_number + month + day + hour_number
    upper_index, lower_index, moving = (subtotal - 1) % 8, (total - 1) % 8, (total - 1) % 6 + 1
    upper, lower = trigram(upper_index), trigram(lower_index)
    lines = lower["lines"] + upper["lines"]
    changed = list(lines)
    changed[moving - 1] = 1 - changed[moving - 1]
    changed_lower = next(i for i, t in enumerate(TRIGRAMS) if tuple(changed[:3]) == t[3])
    changed_upper = next(i for i, t in enumerate(TRIGRAMS) if tuple(changed[3:]) == t[3])
    body, use = (upper, lower) if moving <= 3 else (lower, upper)
    return {
        "version": VERSION,
        "method": "年月日时起卦（梅花易数类口径）",
        "reference": reference,
        "local_time": local.strftime("%Y-%m-%d %H:%M %z"),
        "inputs": {
            "lunar_year": lunar.getYear(),
            "year_branch": BRANCHES[year_number - 1],
            "year_branch_number": year_number,
            "lunar_month": month,
            "leap_month": lunar.getMonth() < 0,
            "lunar_day": day,
            "hour_branch": BRANCHES[hour_number - 1],
            "hour_branch_number": hour_number,
        },
        "upper": upper,
        "lower": lower,
        "moving_line": moving,
        "lines": lines,
        "hexagram": HEXAGRAMS[upper_index][lower_index],
        "changed_hexagram": HEXAGRAMS[changed_upper][changed_lower],
        "changed_upper": trigram(changed_upper),
        "changed_lower": trigram(changed_lower),
        "changed_lines": changed,
        "body": body,
        "use": use,
        "body_use_relation": relation(body["element"], use["element"]),
        "arithmetic": {
            "upper_sum": subtotal,
            "lower_sum": total,
            "upper_remainder": subtotal % 8,
            "lower_remainder": total % 8,
            "moving_remainder": total % 6,
        },
        "conventions": [
            "年数按农历年支序数：子1至亥12，与四柱立春换年的口径分别展示。",
            "月数取农历月序，闰月按同一月序；日数取所选当地民用日期对应的农历日。",
            "上卦取年数加月数加日数除8的余数；下卦再加时支数除8；动爻取总数除6。余0分别作8或6。",
            "先天卦序：乾1、兑2、离3、震4、巽5、坎6、艮7、坤8；爻从下往上编号。",
            "动爻所在卦为用卦，另一卦为体卦；变卦仅翻转该动爻。",
            "起卦农历日期按00:00换日，四柱日柱仍按23:00换日，两种规则不混用。",
        ],
        "limitations": "这是公开口径的传统文化计算，不是《周易》文本直接规定的唯一方法；古籍版本与解释仍待复核，不预测运势。",
    }
