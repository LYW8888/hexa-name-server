"""Bounded, source-linked naming with six reproducible scoring dimensions."""
from __future__ import annotations
from functools import lru_cache
from itertools import permutations, product
import math
import re
import naming_corpus
import naming_rules
import name_numerology
import name_phonology
import phonetics
import tradition

VERSION = 'literary-match-v3'


def character_set(value, name):
    if value is None:
        return set()
    if not isinstance(value,str) or len(value)>100:
        raise ValueError(name+' must contain Chinese characters and separators only')
    if any(not phonetics.is_han(c) and not(c.isspace() or c in '，,、；;') for c in value):
        raise ValueError(name+' must contain Chinese characters and separators only')
    return {c for c in value if phonetics.is_han(c)}


def options(payload, length, avoided):
    required = character_set(payload.get('requiredChars',''),'requiredChars')
    taboo = character_set(payload.get('tabooChars',''),'tabooChars')
    if len(required)>length:
        raise ValueError('requiredChars exceed given-name length')
    if required & (avoided|taboo):
        raise ValueError('requiredChars conflict with avoided or taboo characters')
    mode = payload.get('numerologyMode','reference')
    if mode not in ('off','reference','strict'):
        raise ValueError('numerologyMode must be off, reference, or strict')
    reading = name_phonology.surname_reading(str(payload.get('surname','')).strip(),str(payload.get('surnameReading','')).strip())
    return {'required':required,'taboo':taboo,'taboo_homophones':payload.get('tabooHomophones') in (True,'true','on','1'),
            'numerology_mode':mode,'surname_reading':reading}


@lru_cache(maxsize=4096)
def character(char):
    snapshot = naming_corpus.snapshot()
    entry = snapshot['characters'].get(char)
    existing = naming_rules.catalog().get(char,{})
    radical = entry['radical'] if entry else existing.get('radical')
    element = snapshot['rules']['radical_elements'].get(radical)
    profile = snapshot['profiles'].get(char)
    return {'char':char,'radical':radical,'element':element,'classification':'project_radical_rule' if element else 'unclassified',
            'traditional':entry['traditional'] if entry else None,
            'kangxi_strokes':entry['strokes'] if entry and char not in snapshot['rules']['ambiguous_forms'] else None,
            'meaning':profile['meaning'] if profile else None,
            'stroke_status':'recorded' if entry and char not in snapshot['rules']['ambiguous_forms'] else 'unresolved',
            'stroke_source':{'source_id':'kangxi','line':entry['line'],'sha256':snapshot['sources']['kangxi']['sha256']} if entry else None}


def _phrase_item(row):
    evidence = naming_corpus.evidence(row)
    return {'given':row['given'],'pinyin':row.get('pinyin') or phonetics.default_reading(row['given']),
            'meaning':row['meaning'],'styles':row['styles'],'genders':['unknown','male','female'],
            'tags':['原句取意'],'source_status':'text_matched','citations':[evidence],
            'source_kind':'phrase' if row['given'] in row['quote'] else 'same_sentence',
            'source':f"《{evidence['work']}》·{evidence['chapter']}：{evidence['quote']}"}


@lru_cache(maxsize=1)
def phrases():
    result = {}
    for row in naming_corpus.snapshot()['phrases']:
        result.setdefault(row['given'],_phrase_item(row))
    return result


def _combined(given):
    profiles = naming_corpus.snapshot()['profiles']
    selected = [profiles[c] for c in given]
    evidence = []
    seen = set()
    for p in selected:
        key = (p['source_id'],p['line'],p['quote'])
        if key not in seen:
            seen.add(key)
            evidence.append(naming_corpus.evidence(p))
    same = len(evidence)==1
    return {'given':given,'pinyin':phonetics.default_reading(given),
            'meaning':'；'.join(f"{c}：{profiles[c]['meaning']}" for c in given),
            'styles':list(dict.fromkeys(s for p in selected for s in p['styles'])),
            'genders':['unknown','male','female'],'tags':['同句取字' if same else '古籍取字组合'],
            'source_status':'text_matched','citations':evidence,'source_kind':'same_sentence' if same else 'cross_passage',
            'source':'；'.join(f"《{x['work']}》·{x['chapter']}：{x['quote']}" for x in evidence)}


def generate_pool(length, reference, liked, required, family, avoided, meaning, styles, legacy):
    snapshot = naming_corpus.snapshot()
    profiles = snapshot['profiles']
    target, secondary = reference.get('element'),reference.get('secondary',[])
    available = [c for c in profiles if c not in avoided]
    def priority(c):
        element = character(c)['element']
        return (c in required,c in liked|family,element==target if target else False,
                element in secondary if element else False,
                sum(s in profiles[c]['styles'] for s in styles),
                any(t in meaning for t in (profiles[c]['meaning'],c)) if meaning else False)
    editorial_order = {c:i for i,c in enumerate(snapshot['rules']['search']['editorial_character_order'])}
    available.sort(key=lambda c:(tuple(-int(x) for x in priority(c)),editorial_order.get(c,1000),c))
    budget = snapshot['rules']['search']['character_budget']
    chosen = available[:budget]
    for c in sorted(required):
        if c in profiles and c not in chosen:
            chosen.append(c)
    if required-set(profiles):
        return [],{'uncovered_required':sorted(required-set(profiles)),'searched_characters':len(chosen)}
    result = {}
    limit = snapshot['rules']['search']['candidate_budget']
    def add(given, item=None):
        if len(result)>=limit or len(given)!=length or len(set(given))!=len(given): return
        if not required<=set(given) or set(given)&avoided: return
        selected = item or phrases().get(given)
        if not selected and any(profiles[c].get('context_only') and c not in required|liked|family for c in given): return
        if given not in result: result[given]=selected or _combined(given)
    # Complete phrases stay in the pool even if their characters miss the short list.
    for given,item in phrases().items(): add(given,item)
    for item in legacy:
        if len(item['given'])!=length:continue
        source=item['meaning_source']
        add(item['given'],{**item,'source_status':source['verification_status'],'source':source['description'],
                          'source_kind':'modern_meaning','citations':[]})
    if length==1:
        for c in available: add(c)
    elif length==2:
        for pair in product(chosen,repeat=2): add(''.join(pair))
    else:
        # Fixed required characters get first access to the finite search budget.
        if required:
            remaining=length-len(required)
            for extra in product(chosen,repeat=remaining):
                for values in permutations(sorted(required)+list(extra)): add(''.join(values))
                if len(result)>=limit: break
        else:
            # Interleave both ends and phrases so an alphabetical prefix cannot monopolize the budget.
            words=[g for g in phrases() if len(g)==2 and not(set(g)&avoided)]
            for c in chosen:
                for word in words:
                    add(c+word);add(word+c)
                if len(result)>=limit:break
    return list(result.values()),{'searched_characters':len(chosen),'candidate_budget':limit,'uncovered_required':[]}


def _round(value):
    return math.floor(value+0.5)


def score(item,surname,chart,gua,reference,liked,family,meaning,styles,gender,opts):
    glyphs=[{**character(c),'day_master_relation':tradition.relation(chart['day_master']['element'],character(c)['element']) if character(c)['element'] else None} for c in item['given']]
    pronunciation=name_phonology.assess(surname,item['given'],item['pinyin'],opts['surname_reading'])
    numerology=name_numerology.calculate(surname,item['given']) if opts['numerology_mode']!='off' else {'status':'off','grids':{}}
    weights=naming_corpus.snapshot()['rules']['weights'][gender]
    criteria=[]
    def add(id,label,ratio,reason,enabled=True):
        if not enabled:return
        possible=weights[id]
        criteria.append({'id':id,'label':label,'points':round(max(0,min(1,ratio))*possible,2),'possible':possible,'reason':reason})
    target=reference.get('element')
    secondary=reference.get('secondary',[])
    affinities=[]
    for glyph in glyphs:
        element=glyph['element']
        affinities.append(1 if element==target else .75 if reference['mode']=='yongshen' and element in secondary else .5 if reference['mode']!='yongshen' and element and tradition.GENERATES[element]==target else 0)
    add('element','字形五行意象',sum(affinities)/len(glyphs),
        f"目标{target}；用神参考计1、喜神参考计0.75；按全部名字字数平均。" if reference['mode']=='yongshen' else f"目标{target}；同类计1、生目标计0.5，未归类不补猜。",bool(target))
    source_ratio={'phrase':1,'same_sentence':.9,'cross_passage':.75,'modern_meaning':.4}[item['source_kind']]
    add('source','典故出处',source_ratio,{'phrase':'名字是所列原句中的连续词组。','same_sentence':'同一句选字，释义为项目编写。','cross_passage':'跨篇取字组合，逐字来源分别列出；不声称原书已有完整名字。','modern_meaning':'现代字义组合，未附古籍词组出处。'}[item['source_kind']])
    requested=liked|family
    hits=naming_rules.keyword_hits(meaning,item)
    aspects=[.8 if item['source_kind']!='modern_meaning' else .65]
    if styles: aspects.append(1 if set(styles)&set(item['styles']) else .3)
    if meaning:aspects.append(1 if hits else .25)
    meaning_ratio=sum(aspects)/len(aspects)
    if requested:meaning_ratio=.3*meaning_ratio+.7*len(set(item['given'])&requested)/len(requested)
    add('meaning','寓意与心意',meaning_ratio,'；'.join([item['meaning'],f"风格匹配：{'、'.join(sorted(set(styles)&set(item['styles']))) or '无'}",f"心意用字：{''.join(sorted(set(item['given'])&requested)) or '无'}",f"寓意关键词：{'、'.join(hits) or '无'}"]))
    strokes=[g['kangxi_strokes'] for g in glyphs]
    known=[s for s in strokes if s is not None]
    glyph_ratio=sum(1 if 6<=s<=16 else .6 if 3<=s<=20 else .3 for s in known)/len(glyphs)
    if len(known)>1:
        gap=max(known)-min(known)
        glyph_ratio*=1 if gap<=5 else .75 if gap<=10 else .4
    sancai_ratio = None
    if numerology.get('status') == 'complete':
        sancai_ratio = sum(1 if x['relation'] in ('我生','生我') else .8 if x['relation']=='同类' else .2 for x in numerology['sancai_relations'])/2
        glyph_ratio = .8*glyph_ratio + .2*sancai_ratio
    add('glyph','字形笔画',glyph_ratio,'康熙笔画：'+ '、'.join(str(s) if s is not None else '未确定' for s in strokes)+'；6–16画计满，差5–10降权；三才启用时占该分项20%；未知不猜，不计算未提供的现代结构美感。',bool(known))
    sound=pronunciation['evaluation']
    add('reading','音韵声调',sound['normalized'],f"全名{sound['full_pinyin']}；声调{sound['pattern']}；原始分{sound['raw']}，查表换算；三连平仄扣分{'已触发' if sound['triple_same_category'] else '未触发'}。")
    repeat=bool(set(surname)&set(item['given']))
    boundary_tones=sound['tones']
    same_tone=boundary_tones[len(surname)-1]==boundary_tones[len(surname)]
    ratio=.4 if repeat else .75 if same_tone else 1
    add('surname','姓氏搭配',ratio,f"姓读音{opts['surname_reading']}；"+('姓与名有重复字。' if repeat else '姓与名无重复字。')+('相接声调相同。' if same_tone else '相接声调有变化。'))
    raw=sum(c['points'] for c in criteria);possible=sum(c['possible'] for c in criteria)
    points=_round(raw/possible*100)
    reasons=[f"{c['label']}：{c['reason']}" for c in criteria if c['points']>0]
    elements=list(dict.fromkeys(g['element'] for g in glyphs if g['element']))
    return {'score':points,'characters':glyphs,'elements':elements,'pronunciation':pronunciation,'numerology':numerology,
            'ranking':{'version':VERSION,'raw_points':round(raw,2),'possible_points':possible,'criteria':criteria,'reasons':reasons,'reference':reference,
                       'weights':weights,'notice':'匹配值表示本次所选规则的符合程度，不是运势分；古籍原句与现代释义分别记录。'},
            'score_evidence':f"规则{VERSION}：有效分项{round(raw,2)}/{possible}，归一为{points}；缺少或未启用分项从分母移除。",
            'element_evidence':'；'.join(f"{g['char']}：{g['radical'] or '部首未记录'}部→{g['element'] or '本规则未归类'}"+(f"，相对日主{g['day_master_relation']}" if g['element'] else '') for g in glyphs)+'。仅按声明的部首规则，不以缺项自动补字。',
            'gua_evidence':f"本次按{gua['method']}计算，本卦{gua['hexagram']}、变卦{gua['changed_hexagram']}。本次候选共用此时间起卦；本次选字采用{reference['label']}。",
            'yinyang_evidence':f"出生四柱年月日时均纳入计算；阴阳区分正偏十神，生克经旺衰与喜用方向参与选字；不是名字自身的运势。"}


def analyze_candidates(payload,surname,chart,gua,reference,liked,avoided,family,meaning,styles,gender,length,count,variant,current_name,legacy):
    opts=options(payload,length,avoided)
    excluded=avoided|opts['taboo']|set(naming_corpus.snapshot()['rules']['negative_characters'])
    pool,search=generate_pool(length,reference,liked,opts['required'],family,excluded,meaning,styles,legacy)
    results=[]; filtered={'original_name':0,'homophone':0,'taboo_homophone':0,'numerology':0,'stroke_gap':0}
    taboo_sounds={sound for c in opts['taboo'] for reading in phonetics._readings(c) for sound in name_phonology.tokens(reading)}
    for item in pool:
        if surname+item['given']==current_name:
            filtered['original_name']+=1;continue
        reading=opts['surname_reading']+' '+item['pinyin']
        if name_phonology.negatives(reading):
            filtered['homophone']+=1;continue
        if opts['taboo_homophones'] and taboo_sounds&set(name_phonology.tokens(item['pinyin'])):
            filtered['taboo_homophone']+=1;continue
        known_strokes=[character(c)['kangxi_strokes'] for c in item['given']]
        if length==2 and all(s is not None for s in known_strokes) and abs(known_strokes[0]-known_strokes[1])>10:
            filtered['stroke_gap']+=1;continue
        value=score(item,surname,chart,gua,reference,liked,family,meaning,styles,gender,opts)
        if opts['numerology_mode']=='strict' and not value['numerology'].get('strict_pass'):
            filtered['numerology']+=1;continue
        results.append({**item,**value,'name':surname+item['given'],'element':value['elements'][0] if value['elements'] else None,
                        'tags':list(dict.fromkeys(value['elements']+item['tags'])),'source_reference':None})
    results.sort(key=lambda r:(-r['score'],-next(c['points'] for c in r['ranking']['criteria'] if c['id']=='source'),r['given']))
    diversified = []
    for score_value in sorted({x['score'] for x in results}, reverse=True):
        group = [x for x in results if x['score']==score_value]
        seen_chars = set()
        while group:
            at = min(range(len(group)), key=lambda i:(len((set(group[i]['given'])-opts['required'])&seen_chars), -next(c['points'] for c in group[i]['ranking']['criteria'] if c['id']=='source'), group[i]['given']))
            selected = group.pop(at)
            diversified.append(selected)
            seen_chars.update(set(selected['given'])-opts['required'])
    results = diversified
    # Diversity is a deterministic tie preference; fixed generation characters are never removed.
    effective=min(count,len(results))
    start=variant*count
    selected=results[start:start+effective] if start<len(results) else []
    return selected,{'available_candidate_count':len(results),'candidate_count':len(selected),'page_size':count,
        'has_more_candidates':start+len(selected)<len(results),'algorithm':'literary_v3','ranking_version':VERSION,
        'corpus':naming_corpus.public_stats(),'search':search,'filters':filtered,'numerology_mode':opts['numerology_mode'],
        'constraints':{'required':sorted(opts['required']),'avoided':sorted(avoided),'taboo':sorted(opts['taboo'])},
        'empty_reason':'必用字尚无可引用的正向义项：'+''.join(search['uncovered_required']) if search['uncovered_required'] else '当前必用字、避用字、避讳或数理条件下没有匹配候选。' if not results else None}


def enrich_review(review,surname,chart,payload):
    opts=options({key:value for key,value in payload.items() if key in ('surname','surnameReading')},3,set())
    review['version']='existing-name-v2'
    listed=phrases().get(review['given'])
    if listed:
        review.update(meaning=listed['meaning'],citations=listed['citations'],source_kind=listed['source_kind'],meaning_source={'description':listed['source'],'verification_status':'text_matched'})
    review['characters']=[{**character(c),'day_master_relation':tradition.relation(chart['day_master']['element'],character(c)['element']) if character(c)['element'] else None} for c in review['given']]
    review['classified_count']=sum(bool(g['element']) for g in review['characters'])
    review['element_counts']={e:sum(g['element']==e for g in review['characters']) for e in tradition.GENERATES if any(g['element']==e for g in review['characters'])}
    review['pronunciation']=name_phonology.assess(surname,review['given'],review['pinyin'],opts['surname_reading'])
    review['numerology']=name_numerology.calculate(surname,review['given'])
    review['findings'][3]['detail']='；'.join(f"{g['char']}：{g['radical'] or '部首未记录'}部，{g['element'] or '本规则未归类'}" for g in review['characters'])+'。未归类不等于缺失五行。'
    return review
