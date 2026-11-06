import React, {lazy, Suspense, useLayoutEffect, useRef, useState} from 'react';
import {Button, Dialog, IconButton, Spinner} from '@radix-ui/themes';
import {CheckCheck, FileText, MessageSquareText, X} from 'lucide-react';
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
    if(!response.ok){const error=Error(value.error||'提交未完成，请重试。');error.status=response.status;throw error;}
    return value;
  } catch(error){if(error.name==='AbortError')throw Error('响应超时，资料仍保留。请重试确认本份报告，不会重复扣次。');throw error;}
  finally{clearTimeout(timer);}
}

export default function ExperiencePanel({result,toast,quota}) {
  const [open,setOpen]=useState(false),[mode,setMode]=useState('claim'),[stage,setStage]=useState('proposal');
  const [beta,setBeta]=useState(null),[receipt,setReceipt]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [rating,setRating]=useState(null),[issues,setIssues]=useState([]),[comment,setComment]=useState('');
  const entries=useRef(new WeakMap()),active=useRef(result),pending=useRef(false);
  active.current=result;
  useLayoutEffect(()=>{
    setOpen(false);setBeta(null);setReceipt(null);setError('');setRating(null);setIssues([]);setComment('');
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
    const entry=entries.current.get(result);setError('');setOpen(true);setMode('claim');setBusy(true);pending.current=true;
    try{
      let value;
      try{value=await post('/api/beta-reports/read',identity());}
      catch(e){
        if(e.status!==404)throw e;
        entry.uncertain=false;
        const latest=await quota.refresh();
        if(!latest)throw Error('暂时无法确认名额，请刷新后重试。');
        if(!latest.enabled)throw Error('内测已暂停，已有报告仍可查看。');
        if(!latest.remaining)throw Error('本轮名额已用尽，免费名字提案仍可使用。');
        entry.uncertain=true;
        value=await post('/api/beta-reports',{...identity(),input:result.data,expected_names:result.candidates.map(x=>x.fullName),consent:true});
      }
      value=verifyBeta(value);entry.beta=value;entry.uncertain=false;quota.accept(value.quota);
      if(active.current===result){setBeta(value);setMode('report');}
    }catch(e){
      if(e.status&&e.status<500)entry.uncertain=false;
      if(active.current===result)setError(e.message||'连接失败，请重试确认本份报告。');
      quota.refresh();
    }finally{setBusy(false);pending.current=false;}
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
  const entry=entries.current.get(result);
  const canOpen=entry?.beta||entry?.uncertain||quota.data?.enabled&&quota.data.remaining>0&&!quota.error;
  return <section id="experienceReport" className="experience-panel" aria-label="体验反馈与内测报告" tabIndex={-1}>
    <div><FileText size={22}/><div><b>读懂名字背后的依据</b><p>四柱 · 五行生克 · 选字出处 · 逐名解读</p></div></div>
    {experience?.available?<><div className="experience-actions"><Button type="button" className="primary" onClick={viewReport} disabled={busy||!canOpen}>{busy?<Spinner/>:<FileText size={15}/>}查看完整报告（内测）</Button><Button type="button" variant="outline" onClick={()=>feedback(entry?.beta?'report':'proposal')} disabled={busy}><MessageSquareText size={15}/>反馈本次体验</Button></div><p className="claim-consent">点击查看即同意将本次出生资料与完整报告加密保存最多30天，成功保存使用1个名额。同份重复查看不扣次，反馈自愿。{!canOpen&&(quota.error?' 名额待刷新。':quota.data&&!quota.data.enabled?' 内测已暂停。':quota.data?.remaining===0?' 本轮名额已用尽。':' 正在确认名额。')}</p></>:<p>报告记录服务暂不可用，名字提案仍可使用。</p>}
    <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Content className={`experience-dialog ${mode==='report'?'experience-wide':''}`} maxWidth={mode==='report'?'1080px':'590px'}>
      <div className="experience-content product-theme"><div className="experience-modal-head"><div><Dialog.Title>{mode==='claim'?'免费报告体验':mode==='report'?'完整命名报告（内测）':'分享本次体验'}</Dialog.Title><Dialog.Description>{mode==='feedback'?`评价范围：${stage==='report'?'完整内测报告':'免费名字提案'}。请按实际感受填写，未看过的内容无需评价。`:mode==='claim'?'成功保存才使用名额；重试同一份报告不会重复扣次。':'报告已开放，是否提交反馈由你决定。'}</Dialog.Description></div><Dialog.Close><IconButton aria-label="关闭体验窗口" variant="ghost"><X size={19}/></IconButton></Dialog.Close></div>
      {error&&<p role="alert" className="experience-error">{error}</p>}
      {mode==='claim'&&(busy?<p role="status" className="report-pending"><Spinner/>正在确认并保存完整报告，请稍候…</p>:<div className="claim-retry"><p>当前提案仍保留。可重试确认本份报告，或关闭窗口继续比较名字。</p><Button type="button" className="primary" onClick={viewReport}>重试查看本份报告</Button></div>)}
      {mode==='report'&&beta&&<><ReportBoundary key={beta.id} reference={beta.id} onDownload={downloadBeta}><Suspense fallback={<p role="status">正在整理报告内容…</p>}><BetaReport value={beta} toast={toast}/></Suspense></ReportBoundary><div className="beta-feedback-next"><p>报告是否讲清了依据？欢迎提出真实意见，低分也同样有帮助。</p><Button type="button" className="primary" onClick={()=>feedback('report')}>自愿反馈报告体验</Button><Dialog.Close><Button type="button" variant="outline">暂不反馈，继续使用</Button></Dialog.Close></div></>}
      {mode==='feedback'&&(receipt?<div className="experience-receipt" role="status"><CheckCheck size={32}/><h3>反馈已提交，谢谢你的真实意见。</h3><p>反馈编号：<code>{receipt.id}</code></p><p>经营者可在后台查看并处理，不会自动公开你的评价。</p><Dialog.Close><Button type="button" className="primary">继续使用</Button></Dialog.Close></div>:<form className="experience-form" onSubmit={submit}><fieldset disabled={busy}><legend>这次体验怎么样？<small>请选择1–5分，不预设评分。</small></legend><div className="experience-ratings">{[[1,'很不满意'],[2,'不太满意'],[3,'一般'],[4,'比较满意'],[5,'很满意']].map(([n,label])=><label key={n}><input type="radio" name="experienceRating" value={n} checked={rating===n} onChange={()=>changeFeedback('rating',n)}/><b>{n}</b><small>{label}</small></label>)}</div></fieldset><fieldset disabled={busy}><legend>哪些地方最需要改进？<small>可选，最多4项。</small></legend><div className="experience-issues">{ISSUES.map(([value,label])=><label key={value}><input type="checkbox" checked={issues.includes(value)} disabled={!issues.includes(value)&&issues.length>=4} onChange={()=>changeFeedback('issues',issues.includes(value)?issues.filter(x=>x!==value):[...issues,value])}/>{label}</label>)}</div></fieldset><label>你的改进意见<span className="optional-label">可选</span><textarea name="experienceComment" value={comment} onChange={e=>changeFeedback('comment',e.target.value)} maxLength={1500} rows={4} placeholder="具体是哪一步不方便？你期待怎样改进？无需填写出生资料或联系方式。" disabled={busy}/></label><p className="experience-consent-note">反馈会关联本次提案或已授权内测报告，用于改进，保存30天，不自动公开。是否提交不影响服务使用。</p><div className="experience-submit"><Button className="primary" type="submit" disabled={busy}>{busy&&<Spinner/>}提交体验反馈</Button><Dialog.Close><Button type="button" variant="outline" disabled={busy}>暂不反馈</Button></Dialog.Close></div></form>)}
      </div></Dialog.Content></Dialog.Root>
  </section>;
}
