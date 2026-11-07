import {validNameDetail} from './name-detail-contract.js';
const TIMEOUT_MESSAGE = "排盘服务响应超时，请检查网络后重新生成。";

async function requestReport(
  data,
  { timeoutMs = 15000, fetcher = globalThis.fetch, endpoint = "/api/analyze" } = {},
) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(TIMEOUT_MESSAGE));
      controller.abort();
    }, timeoutMs);
  });
  const request = (async () => {
    try {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.status === 404 || response.status === 405) {
        throw new Error("当前地址未接通起名接口，请检查网站部署后重试。");
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error("起名接口访问受限，请检查网站代理或访问规则后重试。");
      }
      if (response.status === 429)
        throw new Error("请求较多，请稍后重新生成。");
      if (response.status >= 500)
        throw new Error("排盘服务暂时不可用，请稍后重新生成。");
      let payload;
      try {
        payload = await response.json();
      } catch {
        if (controller.signal.aborted) throw new Error(TIMEOUT_MESSAGE);
        throw new Error("起名接口返回的内容无法识别，请检查网站部署后重试。");
      }
      if (!response.ok) throw new Error(payload?.error || "分析请求未通过校验");
      const proposal = payload?.analysis?.access === 'proposal_only';
      const chart = payload?.analysis?.bazi;
      if (
        !proposal || !['operator','public_beta'].includes(payload.analysis.report_delivery) || !Array.isArray(payload.candidates) ||
        payload.candidates.some(row => !row || ['name','given','pinyin','meaning'].some(key => typeof row[key] !== 'string' || !row[key]))
      ) {
        throw new Error("服务未返回完整名字提案，请同步更新页面和服务后重试。");
      }
      if (chart || payload.analysis.mingli || payload.analysis.naming_reference || payload.candidates.some(row => row.ranking || row.citations))
        throw new Error("服务返回了错误的访问范围，请联系维护人员。");
      if (payload.candidates.some(row => row.details && !validNameDetail(row.details)) ||
          (payload.analysis.details_version && payload.candidates.some(row=>!validNameDetail(row.details))))
        throw new Error('名字详情资料不完整，请同步更新页面和服务后重试。');
      if (data.algorithm && payload.analysis.algorithm !== data.algorithm)
        throw new Error("命名服务版本与页面不一致，请刷新后重试。维护人员需同步更新前后端。");
      if (data.purpose && (payload.analysis.purpose_code !== data.purpose || payload.analysis.mode !== data.mode))
        throw new Error("服务返回的起名场景与提交内容不一致，请更新服务后重试。");
      if (data.purpose === "rename") {
        if (payload.analysis.current_name !== data.currentName?.trim() || (endpoint === "/api/name-review" && !payload.analysis.review_completed))
          throw new Error("服务未完成对应现名分析，请更新服务后重试。");
      }
      if (endpoint === "/api/name-review" && (payload.analysis.phase !== "name_review" || payload.candidates.length))
        throw new Error("现名分析接口返回了错误阶段的数据，请更新服务后重试。");
      const preview = payload.analysis.review_preview;
      if (preview && (preview.version !== 'existing-name-preview-v1' || preview.full_name !== data.currentName?.trim() ||
        !Array.isArray(preview.findings) || preview.findings.length !== 3 || new Set(preview.findings.map(row=>row?.id)).size !== 3 ||
        preview.findings.some(row=>!row || !['structure','reading','distinction'].includes(row.id) || typeof row.title !== 'string' || typeof row.detail !== 'string')))
        throw new Error('现名简报资料不完整，请同步更新页面和服务后重试。');
      return payload;
    } catch (error) {
      if (controller.signal.aborted) throw new Error(TIMEOUT_MESSAGE);
      if (error instanceof TypeError)
        throw new Error("无法连接排盘服务，请检查网络后重试。");
      throw error;
    }
  })();
  try {
    return await Promise.race([request, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export function requestAnalysis(data, options = {}) {
  return requestReport(data, { ...options, endpoint: "/api/analyze" });
}
export function requestNameReview(data, options = {}) {
  return requestReport(data, { ...options, endpoint: "/api/name-review" });
}
