import React, { useState } from "react";

const ROLES = {
  同类: "同类 · 日主与比劫",
  生我: "生我 · 印星",
  我生: "我生 · 食伤",
  我克: "我克 · 财星",
  克我: "克我 · 官杀",
};
export function PillarRelations({ value, weights }) {
  const [selected, setSelected] = useState("日柱");
  if (!value) return null;
  const byId = Object.fromEntries(value.nodes.map((n) => [n.id, n]));
  const pairs = value.pairs.filter(
    (p) =>
      !selected ||
      byId[p.from].pillar === selected ||
      byId[p.to].pillar === selected,
  );
  function character(node) {
    return `${node.id}${node.character} · ${node.polarity}${node.element}`;
  }
  return (
    <details className="pillar-relations">
      <summary>
        四柱阴阳五行如何参与起名 <span>年 · 月 · 日 · 时</span>
      </summary>
      <p>
        以日主为中心，五行生克决定生扶、泄耗与克制关系，阴阳同异区分正偏十神；四柱天干和藏干分别进入旺衰计算。
      </p>
      <p className="relation-scroll-hint">
        左右滑动表格，可查看天干、地支与日主的全部关系。
      </p>
      <div className="comparison-table-wrap">
        <table>
          <caption>四柱逐项对照日主</caption>
          <thead>
            <tr>
              <th scope="col">位置</th>
              <th scope="col">天干属性</th>
              <th scope="col">天干与日主</th>
              <th scope="col">地支本气属性</th>
              <th scope="col">本气与日主</th>
            </tr>
          </thead>
          <tbody>
            {value.pillars.map((p) => (
              <tr key={p.label}>
                <th scope="row">{p.label}</th>
                <td>
                  {p.stem.character} · {p.stem.polarity}
                  {p.stem.element}
                </td>
                <td>
                  {p.stem.ten_god} · {p.stem.day_relation}
                </td>
                <td>
                  {p.branch.character} · {p.branch.polarity}
                  {p.branch.element}
                </td>
                <td>{p.branch.day_relation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {weights && (
        <div className="relation-weights" aria-label="生克关系权重">
          {Object.entries(weights).map(([r, w]) => (
            <div key={r}>
              <span>{ROLES[r]}</span>
              <b>{w.toFixed(3)}</b>
            </div>
          ))}
        </div>
      )}
      <p>{value.usage}</p>
      <details className="pairwise-relations">
        <summary>查看八个干支的 28 组两两关系</summary>
        <label>
          按柱查看
          <select
            aria-label="生克关系筛选"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">全部四柱</option>
            {["年柱", "月柱", "日柱", "时柱"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <div className="comparison-table-wrap">
          <table>
            <caption>当前显示 {pairs.length} 组结构关系</caption>
            <thead>
              <tr>
                <th scope="col">一方</th>
                <th scope="col">五行关系</th>
                <th scope="col">另一方</th>
                <th scope="col">阴阳同异</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p) => (
                <tr key={p.from + p.to}>
                  <td>{character(byId[p.from])}</td>
                  <td>{p.description}</td>
                  <td>{character(byId[p.to])}</td>
                  <td>{p.polarity_relation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </details>
  );
}
export default function ClassicalEvidence({ value }) {
  if (!value?.sources?.length) return null;
  const sources = value.sources.filter((x) => x.status === "text_checked");
  return (
    <details className="classical-evidence">
      <summary>
        查看经典原文与方法依据 <span>{sources.length} 处录文已核对</span>
      </summary>
      <p>每条引用记录篇章、录文底本和固定版本，点击书名即可查看原文位置。</p>
      <div className="classical-citations">
        {sources.map((s) => (
          <article key={s.id}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              《{s.title}》· {s.chapter} ↗
            </a>
            <blockquote>{s.quote}</blockquote>
            <p>{s.scope}</p>
            <small>{s.edition} · 原文已核对</small>
          </article>
        ))}
      </div>
      <p className="parameter-origin">
        月令、阴阳与生克原则引用上述古籍；藏干占比、季节系数和强弱阈值采用序名分析参数，完整数值在计算明细中公开。
      </p>
    </details>
  );
}
