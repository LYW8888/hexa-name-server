import { candidateEvidenceLines } from "./candidate-evidence-report.js";
export function nameReviewLines(review) {
  if (!review) return [];
  return ["## 现用姓名分析", "", `现用姓名：${review.full_name}`, ...review.findings.map(x => `- ${x.title}：${x.detail}`),
    ...(review.meaning ? [`- 已收录寓意：${review.meaning}`, `- 寓意资料：${review.meaning_source?.description || "字义寓意"}`] : []),
    ...candidateEvidenceLines(review),
    "", "### 改名方向", ...review.directions.map(x => `- ${x}`), review.notice, ""];
}
