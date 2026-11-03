import React, {lazy, Suspense, useLayoutEffect, useRef, useState} from 'react';
import {Button, Dialog, IconButton, Spinner} from '@radix-ui/themes';
import {ArrowUpRight, CheckCheck, FileText, MessageSquareText, X} from 'lucide-react';
import {requestKey} from './form-state.js';
import {downloadReportFile} from './utils.js';
import './ui/experience.css';
const BetaReport=lazy(()=>import('./BetaReport.jsx'));
const ISSUES=[['form','填写与操作'],['generation','生成速度或失败'],['names','名字不合心意'],['meaning','寓意与读音'],['evidence','取名依据'],['reading','报告阅读'],['other','其他']];
const identifier=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
class ReportBoundary extends React.Component {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="experience-error" role="alert"><p>报告显示未完成，已保存的报告仍可下载，或凭编号联系经营者获取。</p><p>报告编号：{this.props.reference}</p><button type="button" className="secondary" onClick={this.props.onDownload}>下载完整文字报告</button></div>:this.props.children;}
}

async function post(path,data) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try {
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify(data)});
    const value=await response.json().catch(()=>({error:'服务响应无法识别，请稍后重试。'}));
    if(!response.ok)throw Error(value.error||'提交未完成，请重试。');
    return value;
  } catch(error){throw Error(error.name==='AbortError'?'响应超时，已填写的内容仍保留，请重试。':error.message||'连接失败，请重试。');}
  finally{clearTimeout(timer);}
}

export default function ExperiencePanel({result,toast}) {
  const [open,setOpen]=useState(false),[mode,setMode]=useState('invite'),[stage,setStage]=useState('proposal');
  const [beta,setBeta]=useState(null),[receipt,setReceipt]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [code,setCode]=useState(''),[consent,setConsent]=useState(false),[rating,setRating]=useState(null),[issues,setIssues]=useState([]),[comment,setComment]=useState('');
  const entries=useRef(new WeakMap()),active=useRef(result),pending=useRef(false);
  active.current=result;
  useLayoutEffect(()=>{
    setOpen(false);setBeta(null);setReceipt(null);setError('');setCode('');setConsent(false);setRating(null);setIssues([]);setComment('');
    if(result&&!entries.current.has(result))entries.current.set(result,{feedback:{},drafts:{},keys:{proposal:globalThis.crypto?.randomUUID?.(),report:globalThis.crypto?.randomUUID?.()}});
  },[result]);
  const experience=result?.experience;
  const identity=()=>({generation_id:experience.generation_id,generation_token:experience.generation_token});
  function verifyBeta(value){
    if(!identifier(value?.id)||value.report?.kind!=='beta_report'||!value.report.analysis?.bazi||!Array.isArray(value.report.candidates)||requestKey(value.report.data)!==requestKey(result.data)||value.report.candidates.map(x=>x.name).join('\n')!==result.candidates.map(x=>x.fullName).join('\n'))throw Error('服务未返回对应的完整内测报告，请重试或联系经营者。');
    return value;
  }
  function downloadBeta(){
    const r=beta.report,rows=r.candidates.map(x=>({...x,fullName:x.name,scoreEvidence:x.score_evidence,elementEvidence:x.element_evidence,guaEvidence:x.gua_evidence,yinyangEvidence:x.yinyang_evidence}));
    downloadReportFile(r.data,r.analysis,rows,toast,beta.id);
  }
  async function viewReport(){
    if(pending.current)return;
    const entry=entries.current.get(result);setError('');setOpen(true);
    if(!entry.beta){setMode('invite');return;}
    setBusy(true);pending.current=true;
    try{const value=verifyBeta(await post('/api/beta-reports/read',identity()));if(active.current===result){setBeta(value);setMode('report');}}
    catch(e){if(active.current===result){setError(e.message);setMode('invite');}}
    finally{setBusy(false);pending.current=false;}
  }
  async function redeem(e){
    e.preventDefault();if(pending.current)return;
    if(!consent){setError('请确认同意保存本次资料和内测报告。');return;}
    setBusy(true);pending.current=true;setError('');
    try{
      const value=verifyBeta(await post('/api/beta-reports',{...identity(),code:code.trim(),input:result.data,expected_names:result.candidates.map(x=>x.fullName),consent:true}));
      entries.current.get(result).beta=value;
      if(active.current===result){setBeta(value);setMode('report');setCode('');setConsent(false);}
    }catch(e){if(active.current===result)setError(e.message);}
    finally{setBusy(false);pending.current=false;}
  }
  function feedback(nextStage){
    if(pending.current)return;
    const entry=entries.current.get(result),draft=entry.drafts[nextStage]||{rating:null,issues:[],comment:''};
    setRating(draft.rating);setIssues(draft.issues);setComment(draft.comment);
    setStage(nextStage);setReceipt(entry.feedback[nextStage]||null);setMode('feedback');setError('');setOpen(true);
  }
  function changeFeedback(field,value){
    const entry=entries.current.get(result);entry.drafts[stage]={rating,issues,comment,...entry.drafts[stage],[field]:value};setError('');
    if(field==='rating')setRating(value);else if(field==='issues')setIssues(value);else setComment(value);
  }
  async function submit(e){
    e.preventDefault();if(pending.current)return;
    if(!rating){const form=e.currentTarget;setError('请选择本次体验评分，1分至5分均可提交。');requestAnimationFrame(()=>form.querySelector('[name=experienceRating]')?.focus());return;}
    const entry=entries.current.get(result),requestKey=entry.keys[stage];
    if(!requestKey){setError('请使用HTTPS连接或通过经营者反馈。');return;}
    setBusy(true);pending.current=true;setError('');
    try{
      const value=await post('/api/experience-feedback',{...identity(),request_key:requestKey,stage,rating,issues,comment,consent:true});
      if(!identifier(value?.id))throw Error('未收到有效反馈编号，请重试确认。');
      entry.feedback[stage]=value;
      if(active.current===result)setReceipt(value);
    }catch(e){if(active.current===result)setError(e.message);}
    finally{setBusy(false);pending.current=false;}
  }
  if(!result)return null;
  return <section className="experience-panel wrap" aria-label="体验反馈与内测报告">
    <div><MessageSquareText size={22}/><div><b>这个名字，离你的期待还有多远？</b><p>告诉我们哪里顺手、哪里别扭。意见将交给经营者用于改进。</p></div></div>
    {experience?.available?<div className="experience-actions"><Button type="button" variant="outline" onClick={viewReport} disabled={busy}><FileText size={15}/>查看完整报告（内测）</Button><Button type="button" variant="soft" onClick={()=>feedback(entries.current.get(result)?.beta?'report':'proposal')} disabled={busy}><MessageSquareText size={15}/>反馈本次体验</Button></div>:<a href="#reportRequest" className="secondary">联系经营者反馈<ArrowUpRight size={15}/></a>}
    <Dialog.Root open={open} onOpenChange={next=>{if(!busy)setOpen(next);}}><Dialog.Content className={`experience-dialog ${mode==='report'?'experience-wide':''}`} maxWidth={mode==='report'?'1080px':'590px'}>
      <div className="experience-content product-theme"><div className="experience-modal-head"><div><Dialog.Title>{mode==='invite'?'内测完整报告':mode==='report'?'完整命名报告（内测）':'分享本次体验'}</Dialog.Title><Dialog.Description>{mode==='feedback'?`评价范围：${stage==='report'?'完整内测报告':'免费名字提案'}。请按实际感受填写，未看过的内容无需评价。`:mode==='invite'?'受邀用户可先查看完整报告，再自愿反馈；普通用户可联系经营者获取报告。':'报告已开放，是否提交反馈由你决定。'}</Dialog.Description></div><Dialog.Close><IconButton aria-label="关闭体验窗口" variant="ghost" disabled={busy}><X size={19}/></IconButton></Dialog.Close></div>
      {error&&<p role="alert" className="experience-error">{error}</p>}
      {mode==='invite'&&<form onSubmit={redeem} className="experience-form"><label>内测邀请码<input name="betaCode" type="password" value={code} onChange={e=>{setCode(e.target.value);setError('');}} autoComplete="off" maxLength={64} required placeholder="填写经营者提供的内测邀请码" disabled={busy}/></label><label className="experience-check"><input type="checkbox" checked={consent} onChange={e=>{setConsent(e.target.checked);setError('');}} disabled={busy}/><span>我同意将本次出生资料、名字提案与完整报告保存用于内测体验，最多30天；反馈自愿提交。</span></label><Button className="primary" type="submit" disabled={busy||!consent}>{busy?<Spinner/>:<FileText size={16}/>}查看本次完整报告</Button><p>每份邀请可开启一份报告，本页面内可重复查看，也可下载留存。关闭页面后可凭报告编号联系经营者。没有邀请码？<Dialog.Close asChild><a href="#reportRequest">联系经营者</a></Dialog.Close></p></form>}
      {mode==='report'&&beta&&<><ReportBoundary key={beta.id} reference={beta.id} onDownload={downloadBeta}><Suspense fallback={<p role="status">正在整理报告内容…</p>}><BetaReport value={beta} toast={toast}/></Suspense></ReportBoundary><div className="beta-feedback-next"><p>报告是否讲清了依据？欢迎提出真实意见，低分也同样有帮助。</p><Button type="button" className="primary" onClick={()=>feedback('report')}>自愿反馈报告体验</Button><Dialog.Close><Button type="button" variant="outline">暂不反馈，继续使用</Button></Dialog.Close></div></>}
      {mode==='feedback'&&(receipt?<div className="experience-receipt" role="status"><CheckCheck size={32}/><h3>反馈已提交，谢谢你的真实意见。</h3><p>反馈编号：<code>{receipt.id}</code></p><p>经营者可在后台查看并处理，不会自动公开你的评价。</p><Dialog.Close><Button type="button" className="primary">继续使用</Button></Dialog.Close></div>:<form className="experience-form" onSubmit={submit}><fieldset disabled={busy}><legend>这次体验怎么样？<small>请选择1–5分，不预设评分。</small></legend><div className="experience-ratings">{[[1,'很不满意'],[2,'不太满意'],[3,'一般'],[4,'比较满意'],[5,'很满意']].map(([n,label])=><label key={n}><input type="radio" name="experienceRating" value={n} checked={rating===n} onChange={()=>changeFeedback('rating',n)}/><b>{n}</b><small>{label}</small></label>)}</div></fieldset><fieldset disabled={busy}><legend>哪些地方最需要改进？<small>可选，最多4项。</small></legend><div className="experience-issues">{ISSUES.map(([value,label])=><label key={value}><input type="checkbox" checked={issues.includes(value)} disabled={!issues.includes(value)&&issues.length>=4} onChange={()=>changeFeedback('issues',issues.includes(value)?issues.filter(x=>x!==value):[...issues,value])}/>{label}</label>)}</div></fieldset><label>你的改进意见<span className="optional-label">可选</span><textarea name="experienceComment" value={comment} onChange={e=>changeFeedback('comment',e.target.value)} maxLength={1500} rows={4} placeholder="具体是哪一步不方便？你期待怎样改进？无需填写出生资料或联系方式。" disabled={busy}/></label><p className="experience-consent-note">反馈会关联本次提案或已授权内测报告，用于改进，保存30天，不自动公开。是否提交不影响服务使用。</p><div className="experience-submit"><Button className="primary" type="submit" disabled={busy}>{busy&&<Spinner/>}提交体验反馈</Button><Dialog.Close><Button type="button" variant="outline" disabled={busy}>暂不反馈</Button></Dialog.Close></div></form>)}
      </div></Dialog.Content></Dialog.Root>
  </section>;
}
