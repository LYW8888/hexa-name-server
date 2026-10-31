"""Synthetic scenario checks and local timings, not user research or production load tests."""
import json
import statistics
import sys
import time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
import server

base={'algorithm':'literary_v3','surname':'李','mode':'born','birthDate':'1998-08-13','birthTime':'13:48','place':'河南南阳','candidateCount':11,'elementPreference':'yongshen'}
scenarios=[('due',{'mode':'due_date','birthDate':'','birthTime':'','dueDate':'2099-12-23'}),
 ('born',{}),('rename',{'purpose':'rename','currentName':'李明哲'}),
 ('single',{'length':1}),('three',{'length':3}),('compound',{'surname':'欧阳'}),
 ('generation',{'requiredChars':'安'}),('family',{'tabooChars':'宁','requiredChars':'安','honorParents':True,'parents':'宁'}),
 ('strict',{'numerologyMode':'strict'}),('explicit_water',{'elementPreference':'水'}),
 ('solar',{'timeBasis':'apparent_solar','longitude':75.99}),('uncovered',{'requiredChars':'龘'})]
rows=[]
for label,changes in scenarios:
 payload={**base,**changes};start=time.perf_counter();result=server.analyze(payload);elapsed=time.perf_counter()-start
 candidates=result['candidates'];analysis=result['analysis'];required=set(payload.get('requiredChars',''));excluded=set(payload.get('tabooChars',''))
 assert len(candidates)<=payload['candidateCount']
 assert len({x['name'] for x in candidates})==len(candidates)
 for item in candidates:
  assert len(item['given'])==payload.get('length',2)
  assert required<=set(item['given']) and not excluded&set(item['given'])
  assert 0<=item['score']<=100
  assert item['name']!=payload.get('currentName')
  assert all(e['quote'] and e['sha256'] for e in item['citations'])
 if label=='strict':assert all(item['numerology']['strict_pass'] for item in candidates)
 if label=='uncovered':assert candidates==[] and '龘' in analysis['empty_reason']
 rows.append({'scenario':label,'seconds':round(elapsed,4),'returned':len(candidates),'available':analysis['available_candidate_count'],'sample':[x['name'] for x in candidates[:3]]})
times=sorted(row['seconds'] for row in rows)
report={'scope':'12个顺序合成场景，本地功能与单请求计时；非真实用户体验或并发容量测试。','algorithm':'literary_v3','scenarios':rows,'median_seconds':statistics.median(times),'max_seconds':max(times)}
print(json.dumps(report,ensure_ascii=False,indent=2))
