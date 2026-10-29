"""Four pillars with explicit conventions, using lunar_python's solar terms.

Year and month are determined at the actual solar-term instant (the library's
term times use fixed UTC+08:00); day and hour use the entered local civil time.
The late Zi hour (23:00) starts the following sexagenary day.  This module does
not calculate true solar time, hidden-stem strength, favourable elements or fate.
"""
from collections import Counter
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from lunar_python import Solar

BEIJING_STANDARD = timezone(timedelta(hours=8))
STEM_ELEMENT = dict(zip('甲乙丙丁戊己庚辛壬癸', '木木火火土土金金水水'))
BRANCH_ELEMENT = dict(zip('子丑寅卯辰巳午未申酉戌亥', '水土木木土火火土金金土水'))
ELEMENTS = ('木', '火', '土', '金', '水')
MIN_YEAR, MAX_YEAR = 1900, 2100


def _solar(dt):
    return Solar.fromYmdHms(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second)


def _local_moment(date_text, time_text, zone_name):
    try:
        naive = datetime.strptime(f'{date_text} {time_text}', '%Y-%m-%d %H:%M')
    except (ValueError, TypeError) as exc:
        raise ValueError('排盘日期或时间格式无效，请使用 YYYY-MM-DD 和 HH:MM。') from exc
    if not MIN_YEAR <= naive.year <= MAX_YEAR:
        raise ValueError(f'排盘仅支持 {MIN_YEAR}–{MAX_YEAR} 年，请调整日期。')
    zone = ZoneInfo(zone_name)
    choices = [naive.replace(tzinfo=zone, fold=fold) for fold in (0, 1)]
    valid = [candidate for candidate in choices if candidate.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) == naive]
    if not valid:
        raise ValueError('所填当地时间处于夏令时跳变的不存在时段，请核对出生时间。')
    if len(valid) == 2 and valid[0].utcoffset() != valid[1].utcoffset():
        raise ValueError('所填当地时间处于夏令时重复时段，暂无法确定时刻，请核对出生记录。')
    return valid[0]


def _pillar(label, ganzhi):
    return {'label': label, 'ganzhi': ganzhi, 'stem': ganzhi[0], 'branch': ganzhi[1],
            'stem_element': STEM_ELEMENT[ganzhi[0]], 'branch_element': BRANCH_ELEMENT[ganzhi[1]]}


def _term(term, local_zone):
    if term is None:
        return None
    beijing = datetime.strptime(term.getSolar().toYmdHms(), '%Y-%m-%d %H:%M:%S').replace(tzinfo=BEIJING_STANDARD)
    local = beijing.astimezone(local_zone)
    return {'name': term.getName(), 'local_time': local.strftime('%Y-%m-%d %H:%M:%S %z'),
            'beijing_time': beijing.strftime('%Y-%m-%d %H:%M:%S +0800'), '_instant': beijing}


def calculate(date_text, time_text, zone_name, reference=False):
    local = _local_moment(date_text, time_text, zone_name)
    beijing = local.astimezone(BEIJING_STANDARD)
    solar_lunar = _solar(beijing).getLunar()
    calendar_eight = solar_lunar.getEightChar()
    calendar_eight.setSect(1)
    local_eight = _solar(local).getLunar().getEightChar()
    local_eight.setSect(1)
    pillars = [_pillar('年柱', calendar_eight.getYear()), _pillar('月柱', calendar_eight.getMonth()),
               _pillar('日柱', local_eight.getDay()), _pillar('时柱', local_eight.getTime())]
    counts = Counter(element for item in pillars for element in (item['stem_element'], item['branch_element']))
    previous = _term(solar_lunar.getPrevJie(), local.tzinfo)
    following = _term(solar_lunar.getNextJie(), local.tzinfo)
    near = min((t for t in (previous, following) if t), key=lambda t: abs((beijing - t['_instant']).total_seconds()), default=None)
    boundary = None
    if near and abs((beijing - near['_instant']).total_seconds()) <= 120:
        alternatives = []
        for offset in (-120, 120):
            ec = _solar(near['_instant'] + timedelta(seconds=offset)).getLunar().getEightChar()
            alternatives.append({'year': ec.getYear(), 'month': ec.getMonth()})
        boundary = {'term': near['name'], 'local_time': near['local_time'], 'alternatives': alternatives,
                    'warning': '出生时刻距节交接不超过 2 分钟；不同历法实现可能有秒级差异，请复核出生记录和节气时刻。'}
    for term in (previous, following):
        if term:
            term.pop('_instant')
    return {
        'pillars': pillars, 'day_master': {'stem': pillars[2]['stem'], 'element': pillars[2]['stem_element']},
        'element_counts': {element: counts[element] for element in ELEMENTS},
        'previous_jie': previous, 'next_jie': following, 'boundary': boundary,
        'reference': reference, 'local_time': local.strftime('%Y-%m-%d %H:%M %z'),
        'conventions': ['年柱以立春交接时刻为界', '月柱以十二节交接时刻为界', '日柱按当地民用时间 23:00 换日，子时为 23:00–00:59', '节气采用 UTC+8 标准时刻并转换到所选时区', '未使用出生地经度修正真太阳时', '五行统计仅计四柱八字表面天干地支，不含藏干，不等同旺衰或喜用神'],
        'source': {'library': 'lunar_python', 'version': '1.4.8', 'license': 'MIT', 'range': '1900–2100', 'verification': 'cross-checked; official certification pending', 'independent_ephemeris': 'JPL DE421: sampled solar terms 1900–2050; official certification pending'}
    }
