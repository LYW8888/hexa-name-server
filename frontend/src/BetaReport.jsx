import React from 'react';
import TraditionalAnalysis, {SolarCorrection} from './TraditionalAnalysis.jsx';
import CandidateEvidence from './CandidateEvidence.jsx';
import NameReview from './NameReview.jsx';
import {reportText, downloadReportFile} from './utils.js';
import {workflowLabel} from './form-state.js';

export default function BetaReport({value, toast}) {
  const {data,analysis,candidates}=value.report;
  const rows=candidates.map(x=>({...x,fullName:x.name,scoreEvidence:x.score_evidence,elementEvidence:x.element_evidence,guaEvidence:x.gua_evidence,yinyangEvidence:x.yinyang_evidence}));
  const chart=analysis.bazi;
  return <section className="beta-report" aria-label="内测完整报告">
    <div className="beta-report-heading"><div><p className="eyebrow">仅限本次内测 / BETA REPORT</p><h3>{data.surname} · {workflowLabel(data)}</h3><p>{chart.reference?'预产期参考，出生后应按实际时间重新分析。':'使用实际出生信息。'} {chart.local_time}</p></div><button className="secondary" type="button" onClick={()=>downloadReportFile(data,analysis,rows,toast,value.id)}>下载本次内测报告</button></div>
    <p className="beta-retention">报告编号：<code>{value.id}</code><br/>报告保留至 {new Date(value.expires_at*1000).toLocaleString('zh-CN',{hour12:false})}。可在本页面重复查看或下载留存；关闭页面后可凭编号联系经营者。反馈自愿提交。</p>
    {analysis.name_review&&<NameReview review={analysis.name_review} id="betaOriginalName"/>}
    <h4>出生四柱与五行</h4><div className="beta-pillars">{chart.pillars.map(p=><div key={p.label}><small>{p.label}</small><b>{p.ganzhi}</b></div>)}</div>
    <p>日主：{chart.day_master.stem}（{chart.day_master.element}）</p>
    <SolarCorrection chart={chart}/>
    <TraditionalAnalysis value={analysis.mingli} audit={analysis.source_audit} relationships={analysis.traditional.relationships}/>
    <section className="beta-gua"><h4>出生信息起卦</h4><p>本卦：{analysis.gua.hexagram} · 动{analysis.gua.moving_line}爻 · 变卦：{analysis.gua.changed_hexagram}</p><p>{analysis.naming_reference.label}</p></section>
    <h4>逐名解读与古籍出处</h4>
    {candidates.map(item=><article className="beta-name" key={item.name}><h3>{item.name}</h3><p>{item.pronunciation?.evaluation?.full_pinyin||item.pinyin}</p><p>{item.meaning}</p><CandidateEvidence item={item}/></article>)}
    {!candidates.length&&<p>当前条件没有匹配的名字；可结合本报告调整必用字、避讳或筛选条件。</p>}
    <details className="beta-complete-text"><summary>查看完整文字报告、计算口径与逐项说明</summary><pre>{reportText(data,analysis,rows,value.id)}</pre></details>
  </section>;
}
