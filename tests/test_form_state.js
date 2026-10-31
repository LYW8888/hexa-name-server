const test=require('node:test');
const assert=require('node:assert/strict');
test('draft comparison ignores browsing round and normalizes semantically identical options',async()=>{
  const {requestKey}=await import('../frontend/src/form-state.js');
  const first={surname:'林',styles:['classical','nature'],candidateCount:'03',length:'2',variant:0};
  const other={surname:' 林 ',styles:['nature','classical','classical'],candidateCount:3,length:2,variant:5};
  assert.equal(requestKey(first),requestKey(other));
});
test('actual dates, preferences and timing basis change the request identity',async()=>{
  const {requestKey}=await import('../frontend/src/form-state.js');
  const base={surname:'林',dueDate:'2099-12-23',styles:['classical']};
  for(const change of [{dueDate:'2099-01-01'},{likedChars:'安'},{avoidedChars:'伟'},{gender:'male'},{timeBasis:'apparent_solar'},{candidateCount:5},{mode:'born'},{styles:['modern']}]) assert.notEqual(requestKey(base),requestKey({...base,...change}));
});
test('inactive rename and solar fields do not create phantom edits',async()=>{
  const {requestKey}=await import('../frontend/src/form-state.js');
  assert.equal(requestKey({surname:'林'}),requestKey({surname:'林',currentName:'林旧名',longitude:120.16,locationId:'hangzhou'}));
  assert.notEqual(requestKey({surname:'林',purpose:'rename',currentName:'林安'}),requestKey({surname:'林',purpose:'rename',currentName:'林宁'}));
  assert.equal(requestKey({timeBasis:'apparent_solar',longitude:'120.160000'}),requestKey({timeBasis:'apparent_solar',longitude:120.16}));
});

test('inactive scenario dates are ignored and original-name review ignores recommendation preferences',async()=>{
  const {requestKey,nameReviewKey,workflowId}=await import('../frontend/src/form-state.js');
  assert.equal(requestKey({surname:'林',mode:'due_date'}),requestKey({surname:'林',mode:'due_date',birthDate:'2024-01-01',birthTime:'12:00'}));
  assert.equal(requestKey({surname:'林',mode:'born'}),requestKey({surname:'林',mode:'born',dueDate:'2099-01-01'}));
  const base={purpose:'rename',mode:'born',surname:'林',currentName:'林安',birthDate:'2000-01-01',birthTime:'12:00'};
  assert.equal(nameReviewKey(base),nameReviewKey({...base,meaning:'自然',likedChars:'水',elementPreference:'水',candidateCount:9,styles:['nature']}));
  for (const change of [{currentName:'林宁'},{birthTime:'13:00'},{birthDate:'2000-02-01'},{place:'杭州'},{timeBasis:'apparent_solar',longitude:120}]) assert.notEqual(nameReviewKey(base),nameReviewKey({...base,...change}));
  assert.equal(workflowId(base),'rename');
  assert.notEqual(workflowId({mode:'born'}),workflowId({mode:'due_date'}));
});
