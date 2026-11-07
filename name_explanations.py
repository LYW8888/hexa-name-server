"""Traceable per-name explanations; independent of the private full report."""
from copy import deepcopy
from itertools import combinations
import naming_corpus
import tradition

VERSION = 'name-explanation-v1'
STYLE_LABELS = {'classical': '清雅古典', 'modern': '现代简洁', 'nature': '自然山水', 'bright': '明朗开阔'}
SOURCE_LABELS = {'phrase': '原句词组', 'same_sentence': '同句取字', 'cross_passage': '跨篇取字组合', 'modern_meaning': '现代字义组合'}
FIELDS = ('version', 'source', 'benefits', 'considerations', 'characters', 'reading', 'fit', 'elements', 'birthplace', 'reference_note')


def project(value):
    """Allow only this deliberately bounded explanation, never full report fields."""
    if not isinstance(value, dict) or value.get('version') != VERSION:
        return None
    def take(obj, keys):
        return deepcopy({key: obj[key] for key in keys if key in obj})
    result = take(value, FIELDS)
    result['source'] = take(value['source'], ('kind','label','summary','verification'))
    result['source']['citations'] = [take(c, ('source_id','work','chapter','quote','line','sha256','status','selected_characters','version_label')) for c in value['source']['citations']]
    for key in ('benefits','considerations'):
        result[key] = [take(row, ('id','title','text')) for row in value[key]]
    result['characters'] = [take(row, ('char','meaning','radical','element','classification','kangxi_strokes','stroke_status','day_master_relation')) for row in value['characters']]
    result['reading'] = take(value['reading'], ('pinyin','tone_pattern','note'))
    result['fit'] = take(value['fit'], ('mode','direction','secondary','label','explanation','basis'))
    result['elements'] = take(value['elements'], ('generation_cycle','control_cycle','method','usage'))
    result['elements']['pairs'] = [take(row, ('from','to','kind','label','text')) for row in value['elements']['pairs']]
    result['birthplace'] = take(value['birthplace'], ('applied','explanation','note'))
    return result


def build(row, analysis):
    given = row['given']
    kind = row.get('source_kind', 'modern_meaning')
    citations = []
    sources = naming_corpus.snapshot()['sources'] if row.get('citations') else {}
    for citation in row.get('citations', []):
        entry = {key: citation[key] for key in ('source_id', 'work', 'chapter', 'quote', 'line', 'sha256', 'status') if key in citation}
        entry['selected_characters'] = list(dict.fromkeys(c for c in given if c in entry.get('quote', '')))
        entry['version_label'] = sources.get(citation.get('source_id'), {}).get('filename', '项目录文')
        citations.append(entry)
    source_summary = {
        'phrase': '名字是所列原句中的连续词组；名字寓意为结合原句整理的现代解读。',
        'same_sentence': '名中的字取自同一句，顺序可能重新组合；不把重组后的名字冒充原句词组。',
        'cross_passage': '名字由不同篇章中的字组合而成。下方逐条标出取字，完整名字不一定出现在古籍中。',
        'modern_meaning': '按现代字义和家庭心意组合，当前没有可引用的整名古籍出处。',
    }.get(kind, '按实际收录资料说明取字来源。')
    glyphs = row.get('characters', [])
    characters = [{key: glyph.get(key) for key in ('char', 'meaning', 'radical', 'element', 'classification', 'kangxi_strokes', 'stroke_status', 'day_master_relation')} for glyph in glyphs]
    chart = analysis.get('bazi', {})
    reference = analysis.get('naming_reference', {})
    target, secondary = reference.get('element'), reference.get('secondary', [])
    matching = [g['char'] for g in glyphs if target and g.get('element') == target]
    supporting = [g['char'] for g in glyphs if g.get('element') in secondary]
    if reference.get('mode') == 'none':
        fit = '本次选择仅按读音、风格和心意选名，五行没有参与候选排序。'
    elif target:
        fit = f"本次选字方向为{target}。"
        if matching:
            fit += f"{ '、'.join(matching) }按已声明的部首规则归为{target}，直接契合此方向。"
        if supporting:
            fit += f"{ '、'.join(supporting) }归入辅助方向{'、'.join(secondary)}。"
        if not matching and not supporting:
            fit += '这个名字未直接命中首选或辅助五行，推荐主要来自出处、音韵、字形或心意搭配。'
    else:
        fit = '本次没有确定单一五行选字方向，算法没有强行按“缺什么补什么”选字，主要比较出处、读音、字形和心意。'
    sound = row.get('pronunciation', {}).get('evaluation', {})
    criteria = row.get('ranking', {}).get('criteria', [])
    benefits, considerations = [], []
    for criterion in criteria:
        key = criterion['id']
        if key == 'element':
            text = fit
        elif key == 'source':
            text = source_summary
        elif key == 'reading':
            text = f"全名读作{sound.get('full_pinyin', row['pinyin'])}，声调组合为{sound.get('pattern', '以所列拼音为准')}。" + ('连续三字同属平声或仄声，建议结合方言多读几遍。' if sound.get('triple_same_category') else '本规则未出现连续三字同属平声或仄声的情况，可结合日常称呼试读。')
        elif key == 'meaning':
            text = row['meaning'] + '。'
            styles = [STYLE_LABELS.get(value, value) for value in row.get('styles', [])]
            if styles:
                text += f"风格线索：{'、'.join(styles)}。"
            # Include actual preference hits, never claim a semantic AI match.
            reason = criterion.get('reason', '')
            for fragment in reason.split('；'):
                if fragment.startswith(('心意用字：', '寓意关键词：')) and not fragment.endswith('无'):
                    text += fragment + '。'
        elif key == 'glyph':
            text = '名中各字康熙笔画为' + '、'.join(f"{g['char']}{g.get('kangxi_strokes') or '未确定'}画" for g in glyphs) + '，字形分项按已记录的笔画量与差距比较。'
        else:
            text = criterion.get('reason', '')
        entry = {'id': key, 'title': criterion['label'], 'text': text}
        ratio = criterion.get('points', 0) / (criterion.get('possible') or 1)
        (benefits if ratio >= .7 else considerations).append(entry)
    if not benefits:
        benefits.append({'id': 'meaning', 'title': '名字心意', 'text': row['meaning']})
    pairs = []
    for first, second in combinations(characters, 2):
        a, b = first.get('element'), second.get('element')
        if not a or not b:
            pairs.append({'from': first['char'], 'to': second['char'], 'kind': 'unclassified', 'label': '部分字未归类', 'text': '没有明确部首归类的字保持未知，不推断其生克。'})
            continue
        relation = tradition.relation(a, b)
        if relation == '同类':
            label, pair_kind = f'{a}同类', 'same'
        else:
            left, right = (a, b) if relation in ('我生', '我克') else (b, a)
            verb = '生' if relation in ('我生', '生我') else '克'
            label, pair_kind = left + verb + right, 'generate' if verb == '生' else 'control'
        pairs.append({'from': first['char'], 'to': second['char'], 'kind': pair_kind, 'label': label,
                      'text': '相克表示传统分类中的制约关系，不能单凭这两个字判断名字吉凶；还要看日主旺衰与所选取用方向。' if pair_kind == 'control' else '这是字形归类之间的关系，是否契合仍需结合本次选字方向。'})
    correction = chart.get('time_correction', {})
    applied = bool(correction.get('applied'))
    birthplace = ('本次已启用真太阳时，出生地经度用于经度时差与均时差修正，可能改变日柱或时柱；年柱、月柱仍按原始出生时刻与节气判断。' if applied else '本次按当地民用时间排盘。出生城市帮助匹配时区，但没有作经度修正；同一时区、同一出生日期与时刻下，只改城市不会改变排盘或五行。')
    return {
        'version': VERSION,
        'source': {'kind': kind, 'label': SOURCE_LABELS.get(kind, '字义组合'), 'summary': source_summary, 'citations': citations,
                   'verification': '所列原句已与项目收录的原文逐条对照；释义为现代解读。' if citations else '当前按字义解释，不编造古籍引文。'},
        'benefits': benefits, 'considerations': considerations, 'characters': characters,
        'reading': {'pinyin': sound.get('full_pinyin', row['pinyin']), 'tone_pattern': sound.get('pattern', ''), 'note': '普通话读音参考；方言、家族读音与真实称呼建议由家人试读。'},
        'fit': {'mode': reference.get('mode', 'none'), 'direction': target, 'secondary': secondary, 'label': reference.get('label', '日常选名'), 'explanation': fit, 'basis': reference.get('explanation', '')},
        'elements': {'pairs': pairs, 'generation_cycle': '木生火、火生土、土生金、金生水、水生木', 'control_cycle': '木克土、土克水、水克火、火克金、金克木',
                     'method': '字的五行按本项目公开的部首规则归类；未归类不等于八字缺失。',
                     'usage': '排序比较每字与选字方向的契合；字间生克在这里用于解释，不额外重复加扣分。相克不是自动淘汰条件，亦不以五行个数最少者直接当作用神。'},
        'birthplace': {'applied': applied, 'explanation': birthplace, 'note': '出生地本身不增加名字匹配值，也不按地名臆测五行。'},
        'reference_note': '预产期仅为参考，出生后应按实际时间重新分析。' if chart.get('reference') else '使用本次实际出生信息与所选规则解释契合度；匹配值不代表运势。',
    }
