// Shared by live and saved reports; old snapshots may have neither extension.
export function calculationLines(analysis) {
  const lines = [],
    chart = analysis.bazi,
    time = chart?.time_correction,
    m = analysis.mingli;
  if (time) {
    lines.push(
      `时间口径：${time.applied ? "真太阳时" : "民用时钟"}；原始时间 ${time.civil_time}`,
    );
    if (time.applied)
      lines.push(
        `真太阳钟：${time.clock_time}；经度 ${time.longitude}°；经度/时区项 ${time.longitude_minutes} 分钟；均时差 ${time.equation_of_time_minutes} 分钟；合计 ${time.total_minutes} 分钟`,
        `修正公式：${time.formula}；历史UTC偏移 ${time.utc_offset_minutes} 分钟（含夏令时 ${time.dst_minutes} 分钟）`,
        `民用四柱：${chart.civil_pillars.map((p) => `${p.label} ${p.ganzhi}`).join("、")}；变化 ${time.pillar_changes.join("、") || "无"}`,
        time.notice,
        ...(time.near_hour_boundary
          ? ["真太阳钟接近时辰边界，请核对出生时间与经度。"]
          : []),
      );
  }
  if (!m) return lines;
  const p = m.pattern,
    s = m.strength,
    f = m.favorable;
  lines.push(
    `规则试算：${m.method}；版本 ${m.version}；古籍出处与参数核验状态：待复核`,
    m.weight_origin,
    `格局线索：${p.label}；月支${p.month_branch}、取${p.selected_stem}（${p.selected_ten_god}）；${p.basis}`,
    `旺衰试算：${s.label}；助身权重 ${s.support_weight} / 总权重 ${s.total_weight} = ${s.support_percent}%`,
    `强弱阈值：小于 ${s.thresholds.weak_below * 100}%偏弱，大于 ${s.thresholds.strong_above * 100}%偏强，其间中和`,
    `加权五行：${Object.entries(s.element_weights)
      .map(([e, w]) => `${e} ${w}`)
      .join("、")}（不是表面八字次数）`,
    `扶抑喜用参考：${f.primary ? `用${f.primary}，喜${f.secondary.join("、")}` : f.label}；${f.reason}`,
    ...(f.status === "review_required" && f.proposed
      ? [
          `待复核方向：用${f.proposed.primary}、喜${f.proposed.secondary.join("、")}；未参与喜用排序`,
        ]
      : []),
    ...f.review_reasons.map((x) => `复核提醒：${x}`),
    ...s.contributions.map(
      (c) =>
        `${c.pillar}${c.kind} ${c.stem}/${c.element}：${c.base_weight}×${c.share}×${c.season_factor}（月令${c.season}）=${c.weight}，${c.role}`,
    ),
    `权重参数：${JSON.stringify(m.parameters)}`,
    `敏感性：${s.sensitivity.map((x) => `月支权重${x.month_weight}，${x.label}，助身${(x.support_ratio * 100).toFixed(2)}%`).join("；")}`,
    ...m.interactions.map(
      (x) =>
        `组合线索：${x.kind} ${x.characters}（${x.positions.join("、")}）；${x.note}`,
    ),
    ...m.notes,
    f.notice,
    m.notice,
  );
  return lines;
}
