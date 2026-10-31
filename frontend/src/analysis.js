const TIMEOUT_MESSAGE = "排盘服务响应超时，请检查网络后重新生成。";

export async function requestAnalysis(
  data,
  { timeoutMs = 15000, fetcher = globalThis.fetch } = {},
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
      const response = await fetcher("/api/analyze", {
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
      const chart = payload?.analysis?.bazi;
      if (
        !chart ||
        !Array.isArray(chart.pillars) ||
        chart.pillars.length !== 4 ||
        !chart.day_master ||
        !chart.element_counts ||
        !Array.isArray(chart.conventions) ||
        !chart.source ||
        !Array.isArray(payload.candidates)
      ) {
        throw new Error("服务未返回完整方案，请检查服务版本后重新生成。");
      }
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
