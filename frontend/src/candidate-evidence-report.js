export function kindLabel(kind) {
  return {phrase:"原句词组",same_sentence:"同句取字",cross_passage:"跨篇取字组合",modern_meaning:"现代字义组合"}[kind] || kind;
}

export function candidateEvidenceLines(item) {
  const lines = [];
  for (const citation of item.citations || []) {
    lines.push(`- 出处：《${citation.work}》·${citation.chapter}，第${citation.line}行`);
    lines.push(`  原句：${citation.quote}`);
    lines.push(`  文件SHA-256：${citation.sha256}；状态：上传原句对照`);
  }
  if (item.source_kind) lines.push(`- 取字方式：${kindLabel(item.source_kind)}`);
  const numerology = item.numerology;
  if (numerology && numerology.status !== "off") {
    lines.push(`- 五格数理：${numerology.status === "complete" ? Object.entries(numerology.grids).map(([key, x]) => `${key}${x.raw}（归一${x.number}，${x.label}）`).join("；") : `笔画未确定：${(numerology.missing || []).join("、")}`}`);
    if (numerology.sancai) lines.push(`- 三才：${numerology.sancai.join("·")}`);
    if (numerology.convention) lines.push(`- 数理口径：${numerology.convention}`);
    if (numerology.notice) lines.push(`- ${numerology.notice}`);
  }
  if (item.pronunciation?.evaluation) lines.push(`- 全名读音：${item.pronunciation.evaluation.full_pinyin}；声调${item.pronunciation.evaluation.pattern}`);
  if (item.characters?.some(x => "kangxi_strokes" in x)) lines.push(`- 逐字康熙笔画：${item.characters.map(x => `${x.char} ${x.kangxi_strokes ?? "未确定"}`).join("；")}`);
  return lines;
}
