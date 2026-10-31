"""Explicit Kangxi-stroke folk-number profile; no inferred or guessed strokes."""
import naming_corpus
import tradition


def calculate(surname, given):
    snapshot = naming_corpus.snapshot()
    entries, rules = snapshot['characters'], snapshot['rules']['numerology']
    ambiguous = set(snapshot['rules']['ambiguous_forms'])
    missing = list(dict.fromkeys(c for c in surname + given if c not in entries or c in ambiguous))
    if len(given)>3:
        return {'status':'incomplete','missing':[],'grids':{},'notice':'当前五格延伸口径只覆盖1–3字名。'}
    if missing:
        return {'status':'incomplete','missing':missing,'grids':{},'notice':'部分字形笔画尚未确定，不以部首猜算；未知不等于凶数。'}
    s = [entries[c]['strokes'] for c in surname]
    g = [entries[c]['strokes'] for c in given]
    if not s or not g:
        raise ValueError('surname and given name are required for numerology')
    total = sum(s)+sum(g)
    personal = s[-1]+g[0]
    values = {'天格':sum(s)+(len(s)==1),'人格':personal,'地格':sum(g)+(len(g)==1),
              '总格':total,'外格':total-personal+(len(s)==1)+(len(g)==1)}
    elements = {1:'木',2:'木',3:'火',4:'火',5:'土',6:'土',7:'金',8:'金',9:'水',0:'水'}
    grids = {}
    for key, raw in values.items():
        number = (raw-1)%rules['period']+1
        label = '吉' if number in rules['good'] else '半吉' if number in rules['mixed'] else '凶'
        grids[key] = {'raw':raw,'number':number,'label':label,'element':elements[number%10]}
    sancai = [grids[k]['element'] for k in ('天格','人格','地格')]
    relations = [{'from':a,'to':b,'relation':tradition.relation(a,b)} for a,b in zip(sancai,sancai[1:])]
    return {'status':'complete' ,'strokes':{'surname':s,'given':g},'grids':grids,
            'sancai':sancai,'sancai_relations':relations,
            'strict_pass':all(grids[k]['label']!='凶' for k in ('人格','地格','总格')),
            'convention':'康熙记录；虚数按单姓/单名分别加1；三字名按名总画延伸；数理(n−1)%80+1，保留原数。',
            'notice':'五格与三才为所选民俗规则的计算记录，不表示现实运势。'}
