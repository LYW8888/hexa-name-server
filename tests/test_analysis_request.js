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

test('scenario mismatch and missing original-name evidence cannot be displayed as rename results', async()=>{
 const {requestAnalysis,requestNameReview}=await load();
 const data={purpose:'rename',mode:'born',currentName:'李景和'};
 await assert.rejects(requestAnalysis(data,{fetcher:async()=>new Response(JSON.stringify(complete))}),/场景与提交内容不一致/);
 const value={...complete,analysis:{...complete.analysis,purpose_code:'rename',mode:'born',current_name:'李景和'}};
 await assert.rejects(requestAnalysis(data,{fetcher:async()=>new Response(JSON.stringify(value))}),/未返回完整现名分析/);
 value.analysis.name_review={full_name:'李景和',findings:[{title:'结构',detail:'三字全名'}],directions:[]};value.analysis.phase='name_review';
 await assert.rejects(requestNameReview(data,{fetcher:async()=>new Response(JSON.stringify({...value,analysis:{...value.analysis,phase:'recommendations'}}))}),/错误阶段/);
 let url;await requestNameReview(data,{fetcher:async(path)=>{url=path;return new Response(JSON.stringify(value));}});assert.equal(url,'/api/name-review');
});
