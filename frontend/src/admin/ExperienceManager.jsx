import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {downloadReportFile,reportText} from '../utils.js';

const stages={proposal:'名字提案',report:'完整内测报告'};
const states={new:'待处理',planned:'纳入改进',resolved:'已处理'};
const issues={form:'填写与操作',generation:'生成速度或失败',names:'名字不合心意',meaning:'寓意与读音',evidence:'取名依据',reading:'报告阅读',other:'其他'};
const when=value=>new Date(value*1000).toLocaleString('zh-CN',{hour12:false});
const purpose=row=>row.purpose==='rename'?'改名':row.mode==='born'?'已出生起名':'预产期起名';
export default forwardRef(function ExperienceManager({api,notify},controller){
  const [data,setData]=useState(null),[stage,setStage]=useState(''),[state,setState]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [total,setTotal]=useState(''),[enabled,setEnabled]=useState(true),[armed,setArmed]=useState(''),[report,setReport]=useState(null),[reportQuery,setReportQuery]=useState('');
  const epoch=useRef(0);
  async function load(nextStage=stage,nextState=state){
    const current=++epoch.current;setBusy(true);setError('');
    try{const value=await api(`/api/experience?stage=${encodeURIComponent(nextStage)}&state=${encodeURIComponent(nextState)}`);if(current===epoch.current){setData(value);setTotal(String(value.quota.total));setEnabled(value.quota.enabled);}}
    catch(e){if(current===epoch.current)setError(e.message);}
    finally{if(current===epoch.current)setBusy(false);}
  }
  useEffect(()=>{load();return()=>{epoch.current++;};},[]);
  useImperativeHandle(controller,()=>({refresh:()=>load()}));
  async function change(action,id,value){
    if(busy)return;
    if(['delete','revoke','delete-report'].includes(action)&&armed!==`${action}:${id}`){setArmed(`${action}:${id}`);return;}
    setBusy(true);setError('');
    try{await api(`/api/experience/${action}/${id}`,value||{});setArmed('');if(action==='delete-report'&&report?.id===id)setReport(null);await load();}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function saveQuota(e){
    e.preventDefault();if(busy)return;setBusy(true);setError('');
    try{await api('/api/experience/quota',{total:Number(total),enabled,expected_config_version:data.quota.config_version});await load();notify('免费报告名额已更新。');}
    catch(e){await load();setError(`${e.message} 已重新读取当前设置，请核对后再保存。`);}finally{setBusy(false);}
  }
  async function openReport(id){
    if(busy)return;setBusy(true);setError('');
    try{setReport(await api(`/api/experience/reports/${id.trim().toLowerCase()}`));}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  function exportFeedback(){
    const blob=new Blob([JSON.stringify({scope:'当前筛选，最近30天最多100条；生成次数非独立用户数',exported_at:new Date().toISOString(),summary:data.summary,feedback:data.feedback},null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='序名-真实体验反馈.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  const rows=report?.report.candidates.map(x=>({...x,fullName:x.name,scoreEvidence:x.score_evidence,elementEvidence:x.element_evidence,guaEvidence:x.gua_evidence,yinyangEvidence:x.yinyang_evidence}))||[];
  return <section className="surface experience-manager" aria-label="真实体验与内测工作台"><div className="experience-admin-heading"><div><h2>真实体验与内测</h2><p className="small muted">生成记录不保存姓名或出生资料。完整内测报告经用户同意后加密保存，反馈按体验范围分别收集。</p></div><button type="button" onClick={()=>load()} disabled={busy}>刷新体验记录</button></div>
    {error&&<p role="alert" className="admin-notice">{error}</p>}
    {!data&&busy&&<p role="status">正在连接体验记录服务…</p>}
    {data&&<><div className="experience-stats">{[['生成请求',data.summary.generations],['已开放内测报告',data.summary.beta_reports],['已收反馈',data.summary.feedback],['平均评分',data.summary.average_rating===null?'暂无评分':`${data.summary.average_rating}/5`]].map(([label,value])=><div key={label}><small>{label}</small><b>{value}</b></div>)}</div><p className="small muted">最近30天；统计请求与反馈数量，不代表去重用户数。待处理反馈 {data.summary.pending_feedback} 条。</p>
      <p className="small muted">{Object.entries(data.summary.by_stage).map(([key,value])=>`${stages[key]}：${value.count}条反馈，${value.average_rating===null?'暂无评分':`均分${value.average_rating}/5`}`).join('；')}。</p>
      <section className="beta-invite-admin" aria-label="免费体验名额设置"><h3>公开内测 · 免费报告名额</h3><p className="small muted">无需邀请码。按成功保存的完整报告计次；同份重试、重复查看不扣次。删除与到期不返还已用次数。</p><div className="experience-stats">{[['总名额',data.quota.total],['累计已用',data.quota.used],['剩余',data.quota.remaining],['开放状态',data.quota.enabled?'开放':'暂停']].map(([k,v])=><div key={k}><small>{k}</small><b>{v}</b></div>)}</div><form onSubmit={saveQuota} className="quota-admin-form"><label>免费报告总名额<input type="number" name="quotaTotal" min={data.quota.used} max="1000000" step="1" required value={total} onChange={e=>setTotal(e.target.value)} disabled={busy}/></label><label><input type="checkbox" name="quotaEnabled" checked={enabled} onChange={e=>setEnabled(e.target.checked)} disabled={busy}/>开放新报告体验</label><button type="submit" className="accent" disabled={busy}>保存名额设置</button></form><p className="small muted">总额不能低于累计已用数，累计已用不可手动修改。暂停只影响新报告，已保存报告可继续查看。</p></section>
      <div className="experience-filters"><label>体验范围<select value={stage} onChange={e=>{setStage(e.target.value);load(e.target.value,state);}} disabled={busy}><option value="">全部范围</option><option value="proposal">名字提案</option><option value="report">完整内测报告</option></select></label><label>处理状态<select value={state} onChange={e=>{setState(e.target.value);load(stage,e.target.value);}} disabled={busy}><option value="">全部状态</option>{Object.entries(states).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button type="button" onClick={exportFeedback} disabled={busy||!data.feedback.length}>导出当前反馈JSON</button></div>
      <div className="experience-feedback-list">{data.feedback.map(row=><article key={row.id} className="experience-feedback-item"><div className="experience-feedback-heading"><strong>{row.rating}/5 · {stages[row.stage]}</strong><span>{states[row.state]}</span></div><p className="mono">{row.id} · {when(row.created_at)}</p><p>{purpose(row.metrics)} · {row.metrics.count}个提案 · {row.issues.map(x=>issues[x]).join('、')||'未选择改进分类'}</p><p className="feedback-comment">{row.comment||'用户未填写文字意见。'}</p><div className="row-actions"><button type="button" disabled={busy||row.state==='planned'} onClick={()=>change('update',row.id,{state:'planned'})}>纳入改进</button><button type="button" disabled={busy||row.state==='resolved'} onClick={()=>change('update',row.id,{state:'resolved'})}>标记已处理</button>{row.beta_report_id&&<button type="button" disabled={busy} onClick={()=>openReport(row.beta_report_id)}>查看关联内测报告</button>}<button type="button" className="danger" disabled={busy} onClick={()=>change('delete',row.id)}>{armed===`delete:${row.id}`?'确认删除反馈':'删除反馈'}</button></div></article>)}</div>
      {!data.feedback.length&&<p className="empty">当前筛选下暂无用户反馈，尚不能据此推断真实满意度。</p>}
      <details><summary>最近生成记录（最多100条，不含姓名与出生资料）</summary><div className="table-wrap"><table><thead><tr><th>生成编号 / 时间</th><th>场景</th><th>结果与耗时</th></tr></thead><tbody>{data.generations.map(row=><tr key={row.id}><td className="mono">{row.id}<small>{when(row.created_at)}</small></td><td>{purpose(row)}<small>{row.algorithm} · {row.length}字名</small></td><td>{row.count}/{row.requested_count}个<small>{row.duration_ms}毫秒</small></td></tr>)}</tbody></table></div></details>
      <form className="report-search" onSubmit={e=>{e.preventDefault();openReport(reportQuery.trim());}}><label>按报告编号找回<input name="betaReportQuery" value={reportQuery} onChange={e=>setReportQuery(e.target.value)} required pattern="[0-9a-fA-F-]{36}" maxLength={36} placeholder="填写客户提供的内测报告编号"/></label><button type="submit" disabled={busy}>查找内测报告</button></form>
      <details><summary>已保存的内测报告（最多100份）</summary><div className="table-wrap"><table><thead><tr><th>报告编号 / 时间</th><th>提案</th><th>操作</th></tr></thead><tbody>{data.beta_reports.map(row=><tr key={row.id}><td className="mono">{row.id}<small>{when(row.created_at)}</small></td><td>{row.names.join('、')||'当前无匹配名字'}<small>{row.purpose}</small></td><td><button type="button" disabled={busy} onClick={()=>openReport(row.id)}>查看内测报告</button><button type="button" className="danger" disabled={busy} onClick={()=>change('delete-report',row.id)}>{armed===`delete-report:${row.id}`?'确认删除内测报告':'删除内测报告'}</button></td></tr>)}</tbody></table></div></details>
      {report&&<section className="private-report" aria-label="经营者内测完整报告"><div className="private-report-heading"><h3>{report.report.data.surname} · {report.report.analysis.purpose}</h3><button className="accent" type="button" onClick={()=>downloadReportFile(report.report.data,report.report.analysis,rows,notify,report.id)}>导出内测完整报告</button><button type="button" onClick={()=>setReport(null)}>关闭内测报告</button></div><pre className="report-preview">{reportText(report.report.data,report.report.analysis,rows,report.id)}</pre></section>}
    </>}
  </section>;
});
