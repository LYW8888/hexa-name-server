"""Optional cross-check against sxtwl 2.0.7; run with it installed separately.

Both libraries derive from the ShouXing astronomical calendar, so this tests
implementation agreement, not independent observatory certification.
"""
import random
import sys
from pathlib import Path
from datetime import date, datetime, timedelta
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sxtwl
from lunar_python import Solar
from bazi import calculate

STEMS, BRANCHES = '甲乙丙丁戊己庚辛壬癸', '子丑寅卯辰巳午未申酉戌亥'
JIE = {1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23}

def text(gz):
    return STEMS[gz.tg] + BRANCHES[gz.dz]

def cross_check_pillars():
    rng = random.Random(20261029)
    checked = skipped_dst = 0
    for _ in range(1500):
        year, month, day, hour = rng.randrange(1900, 2101), rng.randrange(1, 13), rng.randrange(1, 29), rng.randrange(24)
        reference = sxtwl.fromSolar(year, month, day)
        if reference.hasJieQi():
            continue  # sxtwl's day-level year/month accessors do not switch at the instant
        try:
            chart = calculate(f'{year:04d}-{month:02d}-{day:02d}', f'{hour:02d}:00', 'Asia/Shanghai')
        except ValueError as exc:
            if '夏令时' not in str(exc):
                raise
            skipped_dst += 1
            continue
        day_for_pillar = date(year, month, day) + timedelta(days=1 if hour == 23 else 0)
        day_reference = sxtwl.fromSolar(day_for_pillar.year, day_for_pillar.month, day_for_pillar.day)
        expected = [text(reference.getYearGZ()), text(reference.getMonthGZ()), text(day_reference.getDayGZ()), text(reference.getHourGZ(hour))]
        actual = [item['ganzhi'] for item in chart['pillars']]
        if expected != actual:
            raise AssertionError(f'{year}-{month}-{day} {hour}: {actual} != {expected}')
        checked += 1
    return checked, skipped_dst

def cross_check_terms():
    differences = []
    for year in range(1900, 2101):
        for term in sxtwl.getJieQiByYear(year):
            if term.jqIndex not in JIE:
                continue
            value = sxtwl.JD2DD(term.jd)
            moment = datetime(int(value.Y), int(value.M), int(value.D)) + timedelta(hours=value.h, minutes=value.m, seconds=value.s)
            lunar = Solar.fromYmdHms(moment.year, moment.month, moment.day, moment.hour, moment.minute, moment.second).getLunar()
            terms = [item for item in (lunar.getPrevJie(), lunar.getNextJie()) if item]
            moments = [datetime.strptime(item.getSolar().toYmdHms(), '%Y-%m-%d %H:%M:%S') for item in terms]
            differences.append(min(abs((item - moment).total_seconds()) for item in moments))
    maximum = max(differences)
    if maximum > 120:
        raise AssertionError(f'节气差异超过边界提示窗口: {maximum:.1f} 秒')
    return len(differences), maximum

if __name__ == '__main__':
    count, skipped = cross_check_pillars()
    terms, maximum = cross_check_terms()
    print(f'四柱样本：{count} 条一致；夏令时无效/重复时间跳过 {skipped} 条')
    print(f'节交接样本：{terms} 个，最大差异 {maximum:.1f} 秒')
    print('注意：两套实现有共同历法来源，此结果不是权威机构认证。')
