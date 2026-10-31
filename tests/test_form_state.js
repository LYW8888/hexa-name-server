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
  for(const change of [{birthDate:'2024-01-01'},{birthTime:'12:00'},{likedChars:'安'},{avoidedChars:'伟'},{gender:'male'},{timeBasis:'apparent_solar'},{candidateCount:5},{mode:'born'},{styles:['modern']}]) assert.notEqual(requestKey(base),requestKey({...base,...change}));
});
test('inactive rename and solar fields do not create phantom edits',async()=>{
  const {requestKey}=await import('../frontend/src/form-state.js');
  assert.equal(requestKey({surname:'林'}),requestKey({surname:'林',currentName:'林旧名',longitude:120.16,locationId:'hangzhou'}));
  assert.notEqual(requestKey({surname:'林',purpose:'rename',currentName:'林安'}),requestKey({surname:'林',purpose:'rename',currentName:'林宁'}));
  assert.equal(requestKey({timeBasis:'apparent_solar',longitude:'120.160000'}),requestKey({timeBasis:'apparent_solar',longitude:120.16}));
});
