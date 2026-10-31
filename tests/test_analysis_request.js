const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../frontend/src/analysis.js');
const complete = {analysis:{bazi:{pillars:[{},{},{},{}],day_master:{},element_counts:{},conventions:[],source:{}}},candidates:[]};

test('analysis accepts complete results and reports validation errors', async()=>{
 const {requestAnalysis}=await load();
 assert.deepEqual(await requestAnalysis({}, {fetcher:async()=>new Response(JSON.stringify(complete))}),complete);
 await assert.rejects(requestAnalysis({}, {fetcher:async()=>new Response(JSON.stringify({error:'surname invalid'}),{status:400})}),/surname invalid/);
});
test('missing route, proxy HTML and incomplete data give actionable errors', async()=>{
 const {requestAnalysis}=await load();
 for(const [response,message] of [[new Response('not found',{status:404}),/未接通起名接口/],[new Response('blocked',{status:403}),/访问受限/],[new Response('<html>bad gateway</html>',{status:502}),/暂时不可用/],[new Response('<html>static page</html>'),/无法识别/],[new Response('{}'),/未返回完整方案/]]){
  await assert.rejects(requestAnalysis({}, {fetcher:async()=>response}),message);
 }
});
test('timeout covers a hung request and aborts its signal',async()=>{
 const {requestAnalysis}=await load();let signal;
 await assert.rejects(requestAnalysis({}, {timeoutMs:20,fetcher:(_,options)=>{signal=options.signal;return new Promise(()=>{});}}),/响应超时/);
 assert.equal(signal.aborted,true);
});
test('timeout also covers response-body reading and network failures are visible',async()=>{
 const {requestAnalysis}=await load();
 await assert.rejects(requestAnalysis({}, {timeoutMs:20,fetcher:async()=>({ok:true,status:200,json:()=>new Promise(()=>{})})}),/响应超时/);
 await assert.rejects(requestAnalysis({}, {fetcher:async()=>{throw new TypeError('offline');}}),/无法连接排盘服务/);
});
