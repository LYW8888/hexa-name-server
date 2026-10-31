"""Auxiliary Na Yin and twelve-stage tables; not additional strength weights."""
from lunar_python.util import LunarUtil
import bazi

STAGES = ('长生','沐浴','冠带','临官','帝旺','衰','病','死','墓','绝','胎','养')
START_BRANCH = dict(zip('甲乙丙丁戊己庚辛壬癸','亥午寅酉寅酉巳子申卯'))
BRANCHES = '子丑寅卯辰巳午未申酉戌亥'


def calculate(chart):
    day_stem=chart['day_master']['stem']
    forward=day_stem in '甲丙戊庚壬'
    start=BRANCHES.index(START_BRANCH[day_stem])
    rows=[]
    for p in chart['pillars']:
        position=((BRANCHES.index(p['branch'])-start)*(1 if forward else -1))%12
        rows.append({'label':p['label'],'ganzhi':p['ganzhi'],'nayin':LunarUtil.NAYIN[p['ganzhi']],
                     'changsheng':STAGES[position]})
    return {'pillars':rows,'zodiac':'鼠牛虎兔龙蛇马羊猴鸡狗猪'[BRANCHES.index(chart['pillars'][0]['branch'])],
            'convention':'纳音按lunar_python表；十二长生相对所选钟面的日干，阳顺阴逆，戊随丙、己随丁。',
            'notice':'辅助文化信息，不作为缺项补字、生肖禁忌或额外旺衰加权。'}
