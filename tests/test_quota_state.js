import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeQuota,quotaSnapshot} from '../frontend/src/quota-state.js';
const start={available:true,total:100,used:99,remaining:1,enabled:true,revision:100};
test('last-slot receipt cannot be overwritten by delayed poll or earlier pause',()=>{
  const receipt={...start,used:100,remaining:0,revision:101};
  const latest=mergeQuota(start,receipt);
  assert.equal(mergeQuota(latest,start),latest);
  const expanded=mergeQuota(latest,{...start,total:200,used:100,remaining:100,revision:102});
  assert.equal(expanded.remaining,100);
  assert.equal(mergeQuota(expanded,receipt),expanded);
});
test('unavailable or contradictory quota is never a fake zero or an enabled button',()=>{
  for(const bad of [{available:false},{...start,total:'100'},{...start,remaining:2},{...start,used:-1},{...start,revision:0},{...start,enabled:1}])assert.throws(()=>quotaSnapshot(bad));
  assert.deepEqual(quotaSnapshot({...start,config_version:9,secret:'private'}),start);
});
