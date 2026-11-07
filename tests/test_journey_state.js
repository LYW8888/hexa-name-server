const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../frontend/src/journey-state.js');
const clock = {date:'2026-11-07', minutes:600};

test('journey accepts future due dates but never treats them as actual births', async()=>{
  const {birthGuide}=await load();
  assert.equal(birthGuide({mode:'due_date',dueDate:'2099-05-18'},clock).ready,true);
  assert.equal(birthGuide({mode:'born',birthDate:'2099-05-18',birthTime:'09:00'},clock).ready,false);
  assert.equal(birthGuide({mode:'born',birthDate:clock.date,birthTime:'10:01'},clock).ready,false);
  assert.equal(birthGuide({mode:'born',birthDate:clock.date,birthTime:'10:00'},clock).ready,true);
});
test('incomplete, malformed and overflowed dates cannot claim a prepared birth basis',async()=>{
  const {birthGuide}=await load();
  for(const data of [{},{mode:'born',birthDate:'2024-01-01'},{dueDate:'2024-13-01'},{dueDate:'2023-02-29'},{dueDate:'2024-02-30'},{dueDate:'1899-01-01'},{dueDate:'2101-01-01'},{dueDate:'2024-01-01',dueTime:'24:00'}])assert.equal(birthGuide(data,clock).ready,false);
  assert.equal(birthGuide({dueDate:'2024-02-29'},clock).ready,true);
});
test('solar time needs coordinates, accepts zero and preserves the selected clock in the summary',async()=>{
  const {birthGuide}=await load();const data={dueDate:'2099-05-18',timeBasis:'apparent_solar',zone:'Asia/Taipei'};
  for(const longitude of ['',undefined,181,-181,'NaN'])assert.equal(birthGuide({...data,longitude},clock).ready,false);
  for(const longitude of ['0',0,-180,180,120.16])assert.equal(birthGuide({...data,longitude},clock).ready,true);
  assert.match(birthGuide({...data,longitude:0},clock).summary,/台北时间 · 真太阳时/);
});
test('identity feedback requires a valid surname and the matching full current name',async()=>{
  const {identityGuide}=await load();
  assert.equal(identityGuide({surname:''}).ready,false);
  assert.equal(identityGuide({surname:'abc'}).ready,false);
  assert.equal(identityGuide({surname:'欧阳',purpose:'rename',currentName:'欧阳明哲'}).ready,true);
  assert.equal(identityGuide({surname:'李',purpose:'rename',currentName:'欧阳明哲'}).ready,false);
  assert.equal(identityGuide({surname:'李',purpose:'rename',currentName:'李'}).ready,false);
});
