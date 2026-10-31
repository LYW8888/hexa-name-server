import React from "react";
import CandidateEvidence from "./CandidateEvidence.jsx";

export default function NameReview({ review, id = "existingNameReport", compact = false }) {
  if (!review) return null;
  if (compact) return (
    <section className="name-review compact-name-review" id={id} aria-label="现用姓名分析报告">
      <div className="name-review-heading"><h3>{review.full_name}<small>现名速览</small></h3><span className="card-status">先分析，再推荐</span></div>
      <dl>
        <div><dt>姓名结构</dt><dd>{review.findings.find(x => x.id === "structure")?.detail}</dd></div>
        <div><dt>读音参考</dt><dd>{review.pronunciation?.evaluation?.full_pinyin || review.pinyin}</dd></div>
        <div><dt>用字观察</dt><dd>{review.findings.find(x => x.id === "distinction")?.detail}</dd></div>
      </dl>
      {review.meaning && <p className="compact-meaning">寓意：{review.meaning}</p>}
      <details className="full-name-review"><summary>查看完整现名报告与选字方向</summary><NameReview review={review} id={`${id}Full`} /></details>
    </section>
  );
  return (
    <section className="name-review" id={id} aria-label="现用姓名分析报告">
      <div className="name-review-heading">
        <div>
          <p className="eyebrow">UNDERSTAND YOUR CURRENT NAME</p>
          <h3>{review.full_name}<small>现用姓名分析</small></h3>
        </div>
        <span className="card-status">先分析，再推荐</span>
      </div>
      <p className="name-review-lede">
        先了解现在的名字，再决定哪些特点值得保留、哪些使用习惯希望调整。
      </p>
      <dl>
        {review.findings.map((finding) => (
          <div key={finding.id}>
            <dt>{finding.title}</dt>
            <dd>{finding.detail}</dd>
          </div>
        ))}
      </dl>
      {review.meaning && (
        <p className="review-meaning">
          已收录寓意：{review.meaning}
          <small>{review.meaning_source?.description}</small>
        </p>
      )}
      <CandidateEvidence item={review} />
      <div className="review-directions">
        <h4>改名时可以关注</h4>
        <ul>{review.directions.map((direction) => <li key={direction}>{direction}</li>)}</ul>
      </div>
      <p className="method-note">{review.notice}</p>
    </section>
  );
}
