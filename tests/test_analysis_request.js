const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../frontend/src/analysis.js');
const complete = {analysis:{access:'proposal_only',report_delivery:'operator'},candidates:[]};

test('analysis accepts complete results and reports validation errors', async()=>{
 const {requestAnalysis}=await load();
 assert.deepEqual(await requestAnalysis({}, {fetcher:async()=>new Response(JSON.stringify(complete))}),complete);
 await assert.rejects(requestAnalysis({}, {fetcher:async()=>new Response(JSON.stringify({error:'surname invalid'}),{status:400})}),/surname invalid/);
});
test('missing route, proxy HTML and incomplete data give actionable errors', async()=>{
 const {requestAnalysis}=await load();
 for(const [response,message] of [[new Response('not found',{status:404}),/未接通起名接口/],[new Response('blocked',{status:403}),/访问受限/],[new Response('<html>bad gateway</html>',{status:502}),/暂时不可用/],[new Response('<html>static page</html>'),/无法识别/],[new Response('{}'),/未返回完整名字提案/]]){
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
 const value={...complete,analysis:{...complete.analysis,purpose_code:'rename',mode:'born',current_name:'另一名字'}};
 await assert.rejects(requestAnalysis(data,{fetcher:async()=>new Response(JSON.stringify(value))}),/未完成对应现名分析/);
 value.analysis.current_name='李景和';value.analysis.review_completed=true;value.analysis.phase='name_review';
 await assert.rejects(requestNameReview(data,{fetcher:async()=>new Response(JSON.stringify({...value,analysis:{...value.analysis,phase:'recommendations'}}))}),/错误阶段/);
 let url;await requestNameReview(data,{fetcher:async(path)=>{url=path;return new Response(JSON.stringify(value));}});assert.equal(url,'/api/name-review');
});

test('public client rejects full analysis even if labelled as a proposal',async()=>{const {requestAnalysis}=await load();await assert.rejects(requestAnalysis({}, {fetcher:async()=>new Response(JSON.stringify({...complete,analysis:{...complete.analysis,bazi:{pillars:[]}}}))}),/错误的访问范围/);});

test('client rejects malformed per-name explanations instead of opening a broken detail page',async()=>{
 const {requestAnalysis}=await load();
 const row={name:'陈清和',given:'清和',pinyin:'chén qīng hé',meaning:'清朗平和',details:{version:'name-explanation-v1',source:{citations:{}}}};
 await assert.rejects(requestAnalysis({}, {fetcher:async()=>new Response(JSON.stringify({...complete,candidates:[row]}))}),/名字详情资料不完整/);
 await assert.rejects(requestAnalysis({}, {fetcher:async()=>new Response(JSON.stringify({...complete,analysis:{...complete.analysis,details_version:'name-explanation-v1'},candidates:[{...row,details:null}]}))}),/名字详情资料不完整/);
});

test('current-name preview must describe the submitted name and all three distinct everyday findings',async()=>{
 const {requestNameReview}=await load();
 const data={purpose:'rename',mode:'born',currentName:'欧阳明明'};
 const preview={version:'existing-name-preview-v1',full_name:data.currentName,findings:['structure','reading','distinction'].map(id=>({id,title:id,detail:'实际现名观察'}))};
 const analysis={...complete.analysis,purpose_code:'rename',mode:'born',current_name:data.currentName,review_completed:true,phase:'name_review'};
 const fetcher=value=>async()=>new Response(JSON.stringify({analysis:{...analysis,review_preview:value},candidates:[]}));
 assert.equal((await requestNameReview(data,{fetcher:fetcher(preview)})).analysis.review_preview.full_name,data.currentName);
 for(const value of [{...preview,full_name:'另一姓名'},{...preview,findings:preview.findings.slice(0,2)},{...preview,findings:[preview.findings[0],preview.findings[0],preview.findings[2]]},{...preview,findings:[...preview.findings.slice(0,2),{id:'birth',title:'出生四柱',detail:'private'}]}])
  await assert.rejects(requestNameReview(data,{fetcher:fetcher(value)}),/现名简报资料不完整/);
});
