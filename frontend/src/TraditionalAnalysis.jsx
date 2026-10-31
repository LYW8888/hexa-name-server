import React from "react";
import ClassicalEvidence, { PillarRelations } from "./ClassicalEvidence.jsx";

function minutes(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} 分钟`;
}
export function SolarCorrection({ chart }) {
  const value = chart.time_correction;
  if (!value) return null;
  return (
    <section className="solar-correction" aria-label="排盘时间修正">
      <div className="comparison-heading">
        <h3>{value.applied ? "真太阳时修正" : "民用时钟排盘"}</h3>
        <span>
          {value.applied
            ? `合计 ${minutes(value.total_minutes)}`
            : "采用所选地区历史时区"}
        </span>
      </div>
      {value.applied ? (
        <>
          <div className="time-comparison">
            <div>
              <small>原始民用时间</small>
              <b>{value.civil_time}</b>
            </div>
            <span aria-hidden="true">→</span>
            <div>
              <small>用于日柱、时柱与起卦的真太阳钟</small>
              <b>{value.clock_time}</b>
            </div>
          </div>
          <p>
            经度 {value.longitude}° · 经度/时区项{" "}
            {minutes(value.longitude_minutes)} · 均时差{" "}
            {minutes(value.equation_of_time_minutes)}
          </p>
          <p>
            相对民用排盘：
            {value.pillar_changes.length
              ? `${value.pillar_changes.join("、")}有变化`
              : "四柱相同"}
            。年柱、月柱仍按原始物理时刻的节气交接确定。
          </p>
          {value.near_hour_boundary && (
            <p className="calculation-warning">
              修正后接近时辰边界，请核对实际出生时间和地点经度。
            </p>
          )}
          <details>
            <summary>查看修正公式与民用四柱</summary>
            <p>{value.formula}。</p>
            <p>
              当时 UTC 偏移 {value.utc_offset_minutes} 分钟，含夏令时{" "}
              {value.dst_minutes} 分钟；民用四柱：
              {chart.civil_pillars
                .map((p) => `${p.label} ${p.ganzhi}`)
                .join("、")}
              。
            </p>
            <p>{value.notice}</p>
          </details>
        </>
      ) : (
        <p>{value.notice} 可在出生信息的“排盘时间设置”中改用真太阳时。</p>
      )}
      {!value.applied && value.near_hour_boundary && (
        <p className="calculation-warning">
          民用时钟接近时辰边界，请核对准确出生时间；喜用参考暂不自动参与排序。
        </p>
      )}
    </section>
  );
}
export default function TraditionalAnalysis({ value, audit, relationships }) {
  if (!value) return null;
  const { pattern: p, strength: s, favorable: f } = value;
  const proposed = f.proposed;
  return (
    <section className="mingli-analysis" aria-label="格局旺衰与喜用参考">
      <div className="comparison-heading">
        <h3>格局 · 旺衰 · 喜用参考</h3>
        <span>四柱生克 · 月令扶抑</span>
      </div>
      <p>从出生四柱出发，结合月令、藏干与日主关系，整理本次选字方向。</p>
      <div className="mingli-highlights">
        <div>
          <small>月令格局线索</small>
          <b>{p.label}</b>
          <span>
            月支{p.month_branch} · 取{p.selected_stem}（{p.selected_ten_god}）
          </span>
        </div>
        <div>
          <small>旺衰分析</small>
          <b>{s.label}</b>
          <span>
            助身占比 {s.support_percent}% · 月令状态{s.month_state}
          </span>
        </div>
        <div>
          <small>扶抑喜用参考</small>
          <b>
            {f.primary
              ? `用${f.primary} · 喜${f.secondary.join("、")}`
              : f.label}
          </b>
          <span>
            {f.primary
              ? "用于本次五行选字与候选比较"
              : "本次不据此自动指定选字五行"}
          </span>
        </div>
      </div>
      <p>{p.basis}</p>
      <p>{f.reason}</p>
      {f.status === "review_required" && proposed && (
        <p className="calculation-warning">
          可进一步比较：用{proposed.primary}、喜{proposed.secondary.join("、")}
          。当前保留多种取用方向，先按读音、风格与心意用字排序。
        </p>
      )}
      {f.review_reasons.length > 0 && (
        <ul className="calculation-reviews">
          {f.review_reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <PillarRelations value={relationships} weights={s.relation_weights} />
      <details className="strength-evidence">
        <summary>查看旺衰权重、根气与敏感性</summary>
        <p>
          助身权重 {s.support_weight} ÷ 总权重 {s.total_weight} ={" "}
          {(s.support_ratio * 100).toFixed(2)}%。小于
          {s.thresholds.weak_below * 100}%列偏弱、大于
          {s.thresholds.strong_above * 100}
          %列偏强，其间列中和。阈值属于序名分析参数，用于本方法内的相对比较。
        </p>
        <div className="weighted-elements">
          {Object.entries(s.element_weights).map(([e, w]) => (
            <div key={e}>
              <b>{e}</b>
              <meter
                min="0"
                max={s.total_weight}
                value={w}
                aria-label={`${e}权重${w}`}
              />
              <span>{w.toFixed(3)}</span>
              <small>月令{s.season_states[e]}</small>
            </div>
          ))}
        </div>
        <p>
          根气线索：
          {s.roots.length
            ? s.roots
                .map((r) => `${r.pillar}${r.branch}藏${r.stems.join("、")}`)
                .join("；")
            : "未见同五行藏干"}
          。{s.root_definition}
        </p>
        <div className="comparison-table-wrap">
          <table>
            <caption>每项天干与藏干的旺衰权重</caption>
            <thead>
              <tr>
                <th scope="col">位置</th>
                <th scope="col">字/五行</th>
                <th scope="col">基本权重</th>
                <th scope="col">藏干占比</th>
                <th scope="col">月令系数</th>
                <th scope="col">结果</th>
                <th scope="col">相对日主</th>
              </tr>
            </thead>
            <tbody>
              {s.contributions.map((c, i) => (
                <tr key={i}>
                  <th scope="row">
                    {c.pillar}
                    {c.kind}
                  </th>
                  <td>
                    {c.stem} · {c.element}
                  </td>
                  <td>{c.base_weight}</td>
                  <td>{c.share}</td>
                  <td>
                    {c.season} {c.season_factor}
                  </td>
                  <td>{c.weight}</td>
                  <td>{c.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          敏感性检查：
          {s.sensitivity
            .map(
              (x) =>
                `月支权重${x.month_weight}时，${x.label}（${(x.support_ratio * 100).toFixed(2)}%）`,
            )
            .join("；")}
          。
        </p>
        <p>
          藏干占比：
          {Object.entries(value.parameters.hidden_shares)
            .map(([n, v]) => `${n}项时 ${v.join("/")}`)
            .join("；")}
          。天干权重{value.parameters.stem_weight}，普通地支
          {value.parameters.branch_weight}，月支
          {value.parameters.month_branch_weight}。
        </p>
      </details>
      <details>
        <summary>查看透干、合冲与规则范围</summary>
        <p>{p.notice}</p>
        <p>
          月令藏干透出：
          {p.exposed.length
            ? p.exposed
                .map(
                  (x) =>
                    `${x.stem}（${x.ten_god}）见于${x.positions.join("、")}`,
                )
                .join("；")
            : "未见年、月、时干透出"}
          。
        </p>
        {value.interactions.length ? (
          value.interactions.map((x, i) => (
            <p key={i}>
              {x.kind} · {x.characters} {x.positions.join("、")}：{x.note}
            </p>
          ))
        ) : (
          <p>本规则未检出所列合冲与透干组合；不表示已经检查所有命理关系。</p>
        )}
        {value.notes.map((x) => (
          <p key={x}>{x}</p>
        ))}
        <p>
          规则版本 {value.version}。{value.notice}
        </p>
      </details>
      <ClassicalEvidence value={audit} />
      <p className="mingli-notice">
        分析采用月令取格与扶抑口径，供家庭结合寓意、读写习惯一起选名。
      </p>
    </section>
  );
}
