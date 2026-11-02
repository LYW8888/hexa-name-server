import React, {useEffect, useRef, useState} from 'react';
import {downloadReportFile, reportText} from '../utils.js';

const when=value=>new Date(value*1000).toLocaleString('zh-CN',{hour12:false});
export default function ReportsManager({api, notify}) {
  const [rows,setRows]=useState([]), [query,setQuery]=useState(''), [current,setCurrent]=useState(null);
  const [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [armed,setArmed]=useState('');
  const epoch=useRef(0);
  useEffect(()=>{load();return()=>{epoch.current++;};},[]);
  async function load(search=query) {
    const id=++epoch.current;setBusy(true);setMessage('');
    try {const value=await api('/api/reports'+(search.trim()?`?query=${encodeURIComponent(search.trim())}`:''));if(id===epoch.current)setRows(value.requests);}
    catch(error){if(id===epoch.current)setMessage(error.message);}
    finally{if(id===epoch.current)setBusy(false);}
  }
  async function open(reference) {
    setBusy(true);setMessage('');setArmed('');
    try{setCurrent(await api(`/api/reports/${reference}`));}
    catch(error){setMessage(error.message);}
    finally{setBusy(false);}
  }
  async function change(action) {
    if(armed!==action){setArmed(action);return;}
    setBusy(true);setMessage('');
    try{await api(`/api/reports/${current.id}/${action}`,{});setArmed('');
      if(action==='delete')setCurrent(null);else setCurrent({...current,status:'delivered'});
      await load();notify(action==='delete'?'申请与报告已删除。':'已标记为人工交付。');
    }catch(error){setMessage(error.message);}finally{setBusy(false);}
  }
  const report=current?.report;
  const candidates=report?.candidates.map(x=>({...x,fullName:x.name,scoreEvidence:x.score_evidence,elementEvidence:x.element_evidence,guaEvidence:x.gua_evidence,yinyangEvidence:x.yinyang_evidence})) || [];
  return <section className="surface reports-workspace" aria-label="完整报告工作台">
    <h2>报告申请与人工交付</h2><p className="small muted">按客户提供的申请编号查找，核对后导出并通过微信或QQ人工发送。其他岗位无权读取此处资料。</p>
    <form className="report-search" onSubmit={e=>{e.preventDefault();setCurrent(null);setArmed('');load();}}><label>申请编号<input name="reportQuery" value={query} onChange={e=>setQuery(e.target.value)} placeholder="粘贴申请编号或客户的咨询信息" maxLength={1000}/></label><button disabled={busy}>查找申请</button><button type="button" disabled={busy} onClick={()=>{setQuery('');setCurrent(null);load('');}}>查看最近申请</button></form>
    {message&&<p role="alert" className="notice error">{message}</p>}
    <div className="table-wrap"><table><thead><tr><th>申请编号 / 时间</th><th>提案 / 状态</th><th>操作</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td className="mono">{row.id}<small>{when(row.created_at)}</small></td><td>{row.names.join('、')}<small>{row.purpose} · {row.status==='delivered'?'已人工交付':'待核对与交付'}</small></td><td><button type="button" disabled={busy} onClick={()=>open(row.id)}>查看完整报告</button></td></tr>)}</tbody></table></div>
    {!rows.length&&!busy&&<p className="empty">暂无匹配申请。只有客户明确同意提交后才会生成申请记录。</p>}
    {report&&<section className="private-report" aria-label="经营者完整报告"><div className="private-report-heading"><div><h3>{report.data.surname} · {report.analysis.purpose}</h3><p className="mono">申请编号：{current.id}</p></div><button className="accent" type="button" disabled={busy} onClick={()=>downloadReportFile(report.data,report.analysis,candidates,notify,current.id)}>导出完整报告</button></div>
      <div className="report-facts"><div><small>四柱</small><b>{report.analysis.bazi.pillars.map(x=>x.ganzhi).join(' ')}</b></div><div><small>旺衰与喜用参考</small><b>{report.analysis.mingli.strength.label}</b><span>{report.analysis.naming_reference.label}</span></div><div><small>时间口径</small><b>{report.analysis.bazi.time_correction.applied?'真太阳时':'民用时间'}</b><span>{report.analysis.bazi.local_time}</span></div></div>
      <p>候选：{report.candidates.map(x=>x.name).join('、')}</p><p className="small muted">保留至 {when(current.expires_at)}。导出包含出生资料、现名分析（改名时）、四柱、生克喜用、出处与逐名说明。</p>
      <details open><summary>阅读完整报告内容</summary><pre className="report-preview">{reportText(report.data,report.analysis,candidates,current.id)}</pre></details>
      <div className="report-admin-actions"><button type="button" disabled={busy||current.status==='delivered'} onClick={()=>change('deliver')}>{current.status==='delivered'?'已人工交付':armed==='deliver'?'确认已通过微信或QQ交付':'标记已交付'}</button><button className="danger" type="button" disabled={busy} onClick={()=>change('delete')}>{armed==='delete'?'确认删除申请与报告':'删除申请与报告'}</button>{armed&&<button type="button" onClick={()=>setArmed('')}>取消</button>}</div>
    </section>}
  </section>;
}
