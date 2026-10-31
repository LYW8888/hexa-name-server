import React from "react";

export default function NameReview({ review, id = "existingNameReport" }) {
  if (!review) return null;
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
      <div className="review-directions">
        <h4>改名时可以关注</h4>
        <ul>{review.directions.map((direction) => <li key={direction}>{direction}</li>)}</ul>
      </div>
      <p className="method-note">{review.notice}</p>
    </section>
  );
}
