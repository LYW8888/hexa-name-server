import React, { useEffect, useState } from "react";
import TraditionalAnalysis, {
  SolarCorrection,
} from "./TraditionalAnalysis.jsx";
import { readingNotes } from "./utils.js";

function Boundary({ boundary }) {
  if (!boundary) return null;
  return (
    <p className="boundary-notice">
      {boundary.warning}
      <br />
      {boundary.term} {boundary.local_time}；交接前{" "}
      {boundary.alternatives[0].year}年 {boundary.alternatives[0].month}
      月，交接后 {boundary.alternatives[1].year}年{" "}
      {boundary.alternatives[1].month}月。
    </p>
  );
}
function Comparison({ value }) {
  if (!value) return null;
  if (value.error)
    return (
      <section className="bazi-comparison" aria-label="预产期与出生信息对照">
        <h3>预产期与实际出生对照</h3>
        <p className="comparison-warning">
          预产期参考排盘暂不可用：{value.error} 实际出生排盘不受影响。
        </p>
      </section>
    );
  if (
    !value.reference ||
    !Array.isArray(value.differences) ||
    value.differences.length !== 4
  )
    return null;
  const refBoundary = value.reference.boundary;
  return (
    <section className="bazi-comparison" aria-label="预产期与出生信息对照">
      <div className="comparison-heading">
        <h3>预产期与实际出生对照</h3>
        <span>
          {value.near_boundary
            ? "靠近节气，需复核"
            : value.has_changes
              ? "四柱中有变化"
              : "四柱相同"}
        </span>
      </div>
      <p>预产期参考 {value.reference.local_time}；主排盘采用实际出生时间。</p>
      <div className="comparison-table-wrap">
        <table>
          <caption>预产期参考与实际出生的四柱对照</caption>
          <thead>
            <tr>
              <th scope="col">时间依据</th>
              {value.differences.map((item) => (
                <th key={item.label} scope="col">
                  {item.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">预产期参考</th>
              {value.differences.map((item) => (
                <td key={item.label}>{item.reference}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">实际出生</th>
              {value.differences.map((item) => (
                <td key={item.label}>{item.actual}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">对照</th>
              {value.differences.map((item) => (
                <td
                  key={item.label}
                  className={item.changed ? "comparison-changed" : ""}
                >
                  {item.changed ? "有变化" : "相同"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {value.near_boundary && (
        <p className="comparison-warning">
          其中一组时间接近节气交接，年柱或月柱的对照结果可能随节气时刻核对而变化。
        </p>
      )}
      {refBoundary && <Boundary boundary={refBoundary} />}
      <p className="comparison-note">
        只比较两次输入的四柱，不判断运势好坏；生辰起卦与选字均采用主排盘的实际出生时间。
      </p>
    </section>
  );
}
function Gua({ value }) {
  if (!value) return null;
  const n = value.inputs,
    a = value.arithmetic;
  return (
    <section className="gua-panel" aria-label="生辰起卦依据">
      <div className="gua-title">
        <div>
          <p className="eyebrow">TIME / HEXAGRAM</p>
          <h3>
            本卦{value.hexagram} → 变卦{value.changed_hexagram}
          </h3>
          <p>
            上{value.upper.name}下{value.lower.name} · 动第{value.moving_line}爻
          </p>
        </div>
        <div
          className="hexagram"
          role="img"
          aria-label={`${value.hexagram}卦，从下向上第${value.moving_line}爻动`}
        >
          {[...value.lines].reverse().map((line, i) => (
            <div
              key={i}
              className={`gua-line ${line ? "yang" : "yin"} ${6 - i === value.moving_line ? "moving" : ""}`}
            >
              <i />
              <i />
            </div>
          ))}
        </div>
      </div>
      <p>
        体卦{value.body.name}（{value.body.element}）· 用卦{value.use.name}（
        {value.use.element}）· 体用关系：{value.body_use_relation}
      </p>
      <details>
        <summary>查看起卦算式和口径</summary>
        <p>
          农历 {n.lunar_year} 年{n.leap_month ? "闰" : ""}
          {n.lunar_month}月{n.lunar_day}日；年支{n.year_branch}取
          {n.year_branch_number}，时支{n.hour_branch}取{n.hour_branch_number}。
        </p>
        <p>
          上卦：({n.year_branch_number}+{n.lunar_month}+{n.lunar_day}) ÷ 8 余{" "}
          {a.upper_remainder}，取{value.upper.number}
          {value.upper.name}。下卦：{a.lower_sum} ÷ 8 余 {a.lower_remainder}，取
          {value.lower.number}
          {value.lower.name}。动爻：{a.lower_sum} ÷ 6 余 {a.moving_remainder}
          ，取第{value.moving_line}爻。
        </p>
        {value.conventions.map((x) => (
          <p key={x}>{x}</p>
        ))}
        <p>{value.limitations}</p>
      </details>
    </section>
  );
}
function Chart({ analysis }) {
  const chart = analysis.bazi,
    traditional = analysis.traditional;
  const prior = chart.previous_jie
    ? `${chart.previous_jie.name} ${chart.previous_jie.local_time}`
    : "暂无";
  const next = chart.next_jie
    ? `${chart.next_jie.name} ${chart.next_jie.local_time}`
    : "暂无";
  return (
    <section
      id="traditionalBasis"
      className="summary bazi-summary"
      aria-label="传统计算依据"
    >
      <div className="bazi-title">
        <b>四柱排盘 · {chart.reference ? "预产期参考" : "实际出生"}</b>
        <span>
          日主 {chart.day_master.stem} · {chart.day_master.element}
        </span>
      </div>
      <p>
        {chart.local_time} · {analysis.zone_label || analysis.zone}
      </p>
      <SolarCorrection chart={chart} />
      <div className="pillars">
        {chart.pillars.map((p, i) => (
          <div className="pillar" key={p.label}>
            <span>{p.label}</span>
            <b>{p.ganzhi}</b>
            <small>
              {p.stem_element} · {p.branch_element}
            </small>
            {traditional && (
              <small>
                {traditional.pillars[i].stem_polarity} /{" "}
                {traditional.pillars[i].branch_polarity} ·{" "}
                {traditional.pillars[i].ten_god}
              </small>
            )}
          </div>
        ))}
      </div>
      <div className="element-distribution" aria-label="表面八字五行计数">
        {Object.entries(chart.element_counts).map(([element, count]) => (
          <div key={element}>
            <b>{element}</b>
            <meter
              min="0"
              max="8"
              value={count}
              aria-label={`${element} ${count}项`}
            />
            <span>{count}</span>
          </div>
        ))}
      </div>
      <p className="bazi-counts">
        表面八字五行计数，共 8 项，不含藏干。
        <br />
        <small>
          出现次数不等于旺衰；没有出现也不自动认定为名字应补的五行。
        </small>
      </p>
      {traditional && (
        <>
          <p className="polarity-summary">
            四柱阴阳：阴 {traditional.polarity_counts.阴} · 阳{" "}
            {traditional.polarity_counts.阳} ｜ 月支本气：
            {traditional.month_main_element}
          </p>
          <details className="hidden-stems">
            <summary>查看藏干、十神与计算边界</summary>
            <div className="comparison-table-wrap">
              <table>
                <caption>地支藏干与相对日干的十神</caption>
                <thead>
                  <tr>
                    <th scope="col">柱</th>
                    <th scope="col">天干十神</th>
                    <th scope="col">藏干（本气在前）</th>
                  </tr>
                </thead>
                <tbody>
                  {traditional.pillars.map((p) => (
                    <tr key={p.label}>
                      <th scope="row">{p.label}</th>
                      <td>{p.ten_god}</td>
                      <td>
                        {p.hidden_stems
                          .map(
                            (h) =>
                              `${h.stem} · ${h.element} · ${h.polarity} · ${h.ten_god}`,
                          )
                          .join("；")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              藏干单独计数：
              {Object.entries(traditional.hidden_element_counts)
                .map(([e, c]) => `${e} ${c}`)
                .join("、")}
              。此处为原始次数，旺衰权重另列。
            </p>
            {traditional.notes.map((x) => (
              <p key={x}>{x}</p>
            ))}
          </details>
        </>
      )}
      <TraditionalAnalysis value={analysis.mingli} />
      <Boundary boundary={chart.boundary} />
      <Gua value={analysis.gua} />
      <Comparison value={analysis.bazi_comparison} />
      <details className="bazi-method">
        <summary>查看排盘口径与节气</summary>
        <p>{chart.conventions.join("；")}。</p>
        <p>
          前一节：{prior}；后一节：{next}。
        </p>
        <p>
          历法引擎 {chart.source.library} {chart.source.version}
          ；经跨库样本对照，权威机构认证尚未完成。真太阳时修正口径见上方。
        </p>
      </details>
      <p className="method-note">{analysis.method}</p>
    </section>
  );
}
function NameCard({
  item,
  saved,
  compared,
  compareFull,
  onCompare,
  onCopy,
  onSave,
  onKeepsake,
}) {
  const computed = !!item.ranking;
  return (
    <article className="card">
      <div className="card-top">
        <span className="rank">
          {String(item.rank).padStart(2, "0")} / 名字提案
        </span>
        <span className="card-status">
          {item.source_status === "verified" ? "寓意已复核" : "寓意待核验"}
        </span>
      </div>
      <h3>{item.fullName}</h3>
      <div className="pinyin">
        姓氏 {item.fullName.slice(0, item.fullName.length - item.given.length)}{" "}
        · 名 {item.pinyin}
      </div>
      <p className="meaning">{item.meaning}</p>
      <div className="chips">
        {[...new Set(item.tags)].map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      {computed && (
        <p className="match-reason">
          {item.characters
            ?.map((c) =>
              c.element
                ? `${c.char}：${c.radical}部 · ${c.element}意象`
                : `${c.char}：本规则未归类`,
            )
            .join("；") || "按本次读音、风格与心意用字比较。"}
        </p>
      )}
      <details>
        <summary>查看读音与字形提醒</summary>
        {readingNotes(item.pronunciation).map((note, i) => (
          <p key={i}>{note}</p>
        ))}
      </details>
      <details className="name-evidence">
        <summary>
          {computed ? "查看选字依据与匹配明细" : "查看演示意象与资料状态"}
        </summary>
        <p>{item.elementEvidence}</p>
        <p>{item.guaEvidence}</p>
        <p>{item.yinyangEvidence}</p>
        {computed ? (
          <ul className="score-breakdown">
            {item.ranking.criteria.map((c) => (
              <li key={c.id}>
                <b>
                  {c.label} {c.points}/{c.possible}
                </b>
                <span>{c.reason}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p>{item.scoreEvidence}</p>
        <p>
          寓意资料状态：
          {item.source_status === "verified" ? "已记录复核" : "待核验"}；
          {item.source}
        </p>
        <small className="evidence-disclaimer">
          {computed
            ? item.ranking.notice
            : "此旧版记录的评分和卦象为演示数据，未依据出生信息起卦。"}
        </small>
      </details>
      <div className="card-foot">
        <span className="score">
          {computed ? "偏好匹配" : "演示评分"} {item.score} <small>/ 100</small>
        </span>
        <div className="card-tools">
          <button
            className="compare-name"
            aria-pressed={compared}
            disabled={compareFull && !compared}
            type="button"
            onClick={() => onCompare(item.fullName)}
          >
            {compared ? "移出比较" : "加入比较"}
          </button>
          <button
            className="copy-name"
            data-name={item.fullName}
            type="button"
            onClick={() => onCopy(item.fullName)}
          >
            复制名字
          </button>
          <button
            className="make-keepsake"
            data-name={item.fullName}
            type="button"
            onClick={() => onKeepsake(item.fullName)}
          >
            做心愿卡
          </button>
          <button
            className={`save ${saved ? "saved" : ""}`}
            data-name={item.fullName}
            type="button"
            onClick={() => onSave(item)}
          >
            {saved ? "已收藏" : "收藏 ♡"}
          </button>
        </div>
      </div>
    </article>
  );
}
function CandidateComparison({ items, onClear }) {
  if (!items.length) return null;
  const rows = [
    ["名字", (x) => x.fullName],
    ["名的读音", (x) => x.pinyin],
    ["寓意", (x) => x.meaning],
    [
      "字形五行",
      (x) =>
        x.characters
          ?.map(
            (c) =>
              `${c.char}：${c.radical || "未收录"}部 / ${c.element || "未归类"}`,
          )
          .join("；") || x.elementEvidence,
    ],
    ["本次匹配", (x) => `${x.score}/100（不是运势分）`],
    ["匹配理由", (x) => x.ranking?.reasons.join("；") || "旧版演示记录"],
    [
      "寓意资料",
      (x) => (x.source_status === "verified" ? "已记录复核" : "待核验"),
    ],
  ];
  return (
    <section
      id="candidateComparison"
      className="candidate-comparison"
      aria-label="候选名字比较"
    >
      <div className="comparison-heading">
        <h3>一起读，慢慢选</h3>
        <button type="button" className="secondary" onClick={onClear}>
          清空比较
        </button>
      </div>
      <p>
        已选 {items.length}/3 个；
        {items.length < 2
          ? "再选一个名字，就能并排比较。"
          : "试着连同姓氏念几遍，再和家人讨论。"}
      </p>
      <div className="comparison-table-wrap">
        <table>
          <caption>候选名字逐项比较</caption>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {items.map((x) => (
                  <td key={x.fullName}>{value(x)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export default function Results({
  data,
  analysis,
  candidates,
  status,
  busy,
  saved,
  details,
  savedOpen,
  onCloseSaved,
  onRemove,
  onRegenerate,
  onDownload,
  onCopy,
  onSave,
  onKeepsake,
}) {
  const [compared, setCompared] = useState([]),
    signature = candidates.map((x) => x.fullName).join("|");
  useEffect(() => setCompared([]), [signature, analysis]);
  function compare(name) {
    setCompared((previous) =>
      previous.includes(name)
        ? previous.filter((x) => x !== name)
        : previous.length < 3
          ? [...previous, name]
          : previous,
    );
  }
  return (
    <section className="results wrap" id="results">
      <div className="result-head">
        <div>
          <p className="eyebrow">A THOUGHTFUL SHORTLIST</p>
          <h2>名字方案</h2>
          <p className="result-status" id="resultStatus" role="status">
            {status}
          </p>
        </div>
        <div className="result-actions">
          <button
            className="secondary"
            id="regenerate"
            type="button"
            disabled={busy}
            onClick={onRegenerate}
          >
            <span aria-hidden="true">↻</span> 重新生成
          </button>
          <button
            className="secondary"
            id="downloadReport"
            type="button"
            disabled={!analysis || !candidates.length || busy}
            onClick={onDownload}
          >
            <span aria-hidden="true">↓</span> 下载方案
          </button>
        </div>
      </div>
      <section
        id="savedPanel"
        className="saved-panel"
        aria-label="收藏的名字"
        hidden={!savedOpen}
      >
        <div className="saved-panel-head">
          <div>
            <strong>收藏的名字</strong>
            <p>收藏仅保存在当前浏览器，生成的候选可加入逐项比较。</p>
          </div>
          <button
            className="secondary"
            id="closeSaved"
            type="button"
            onClick={onCloseSaved}
          >
            收起
          </button>
        </div>
        <div id="savedList" className="saved-list">
          {saved.length ? (
            saved.map((name) => (
              <div className="saved-item" key={name}>
                <div>
                  <b>{name}</b>
                  {details[name] ? (
                    <>
                      <small>{details[name].pinyin}</small>
                      <p>{details[name].meaning}</p>
                      <small>
                        {details[name].source_status === "verified"
                          ? "寓意资料已记录复核"
                          : "寓意资料待核验"}
                      </small>
                    </>
                  ) : (
                    <small>旧收藏仅记录名字，可重新生成后补充寓意。</small>
                  )}
                </div>
                <button
                  type="button"
                  className="remove-saved"
                  data-name={name}
                  aria-label={`取消收藏 ${name}`}
                  onClick={() => onRemove(name)}
                >
                  移除
                </button>
              </div>
            ))
          ) : (
            <p className="saved-empty">
              还没有收藏名字。生成方案后，点击名字卡片上的“收藏”。
            </p>
          )}
        </div>
      </section>
      {analysis ? (
        <div id="summary" className="summary result-context">
          <div>
            <strong>
              {data.surname} · {analysis.purpose}
            </strong>
            <small>
              {analysis.scenario} · {analysis.gender} · {data.place}
              <br />
              {analysis.bazi.local_time}
              {analysis.bazi.reference
                ? "（预产期参考，出生后请重算）"
                : "（实际出生优先）"}
            </small>
            {analysis.naming_reference && (
              <p>
                本次选字参考：{analysis.naming_reference.label}。
                {analysis.naming_reference.explanation}
              </p>
            )}
          </div>
          <a href="#traditionalBasis">查看四柱与起卦依据 ↓</a>
        </div>
      ) : (
        <div id="summary" className="summary empty">
          <span>✦</span>
          <p>
            {busy
              ? "正在整理命名方向与四柱参考。"
              : "完成上方信息后，这里会出现你的命名方向与五行参考。"}
          </p>
        </div>
      )}
      <div id="cards" className="cards">
        {analysis && !candidates.length ? (
          <div className="empty-result">
            没有符合避用字要求的候选。请减少避用字或调整名的字数，再重新生成。
          </div>
        ) : (
          candidates.map((item) => (
            <NameCard
              key={item.fullName}
              item={item}
              saved={saved.includes(item.fullName)}
              compared={compared.includes(item.fullName)}
              compareFull={compared.length === 3}
              onCompare={compare}
              onCopy={onCopy}
              onSave={onSave}
              onKeepsake={onKeepsake}
            />
          ))
        )}
      </div>
      <CandidateComparison
        items={candidates.filter((x) => compared.includes(x.fullName))}
        onClear={() => setCompared([])}
      />
      {compared.length > 0 && (
        <a className="comparison-jump" href="#candidateComparison">
          比较已选 {compared.length}/3 ↓
        </a>
      )}
      {analysis && <Chart analysis={analysis} />}
      <div
        id="upgradePanel"
        className="upgrade-panel"
        hidden={!candidates.length}
      >
        <div>
          <strong>已展示 {candidates.length} 个候选</strong>
          <p>
            {analysis?.has_more_candidates
              ? "重新生成可继续查看同一条件下的其他候选；"
              : "已显示当前返回的候选；"}
            也可以收藏或下载本次方案。
          </p>
        </div>
        <a className="primary" href="#form">
          调整偏好 <span>↑</span>
        </a>
      </div>
    </section>
  );
}
