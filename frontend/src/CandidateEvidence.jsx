import React from "react";

export function sourceLabel(status) {
  return status === "verified" ? "出处已核对" : status === "text_matched" ? "原句已对照" : "字义寓意";
}
export function kindLabel(kind) {
  return {phrase:"原句词组",same_sentence:"同句取字",cross_passage:"跨篇取字组合",modern_meaning:"现代字义组合"}[kind] || kind;
}
export function Numerology({ value }) {
  if (!value || value.status === "off") return null;
  return <div className="numerology-evidence">
    {value.status === "complete" ? <>
      <div className="numerology-grid">{Object.entries(value.grids).map(([key,x]) => <div key={key}><span>{key}</span><b>{x.raw}</b><small>{x.label}{x.number !== x.raw ? ` · 归一${x.number}` : ""}</small></div>)}</div>
      <p>三才：{value.sancai.join(" · ")}</p><p>{value.convention}</p>
    </> : <p>笔画未确定：{(value.missing || []).join("、")}。保留未知状态，不作推算。</p>}
    <p className="method-note">{value.notice}</p>
  </div>;
}
export default function CandidateEvidence({ item }) {
  if (!item.citations?.length && !item.numerology) return null;
  return <div className="candidate-provenance">
    {!!item.citations?.length && <details className="literary-citations">
      <summary>查看古籍原句 · {kindLabel(item.source_kind)}</summary>
      <p className="citation-method">{item.source_kind === "cross_passage" ? "以下字分别取意后组合，古籍未必出现完整名字。" : "引文已与上传文件逐条对照，释义为项目编写。"}</p>
      {item.citations.map((citation,i) => <figure key={`${citation.source_id}:${citation.line}:${i}`}>
        <blockquote>{citation.quote}</blockquote>
        <figcaption>《{citation.work}》·{citation.chapter} · 第{citation.line}行</figcaption>
        <details><summary>查看原文版本标识</summary><p className="source-hash">SHA-256：{citation.sha256}</p></details>
      </figure>)}
    </details>}
    {item.numerology?.status !== "off" && item.numerology && <details><summary>查看康熙笔画与五格参考</summary><Numerology value={item.numerology} /></details>}
    {item.pronunciation?.evaluation && <p className="name-full-reading">全名读音：{item.pronunciation.evaluation.full_pinyin} · {item.pronunciation.evaluation.pattern}</p>}
  </div>;
}
