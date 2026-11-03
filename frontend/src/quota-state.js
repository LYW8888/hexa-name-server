export function quotaSnapshot(value) {
  if (!value || value.available !== true || typeof value.enabled !== 'boolean') throw Error('体验名额暂时无法确认，请重试。');
  for (const key of ['total', 'used', 'remaining', 'revision']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw Error('体验名额数据异常，请刷新确认。');
  }
  if (value.used + value.remaining !== value.total || value.revision < 1) throw Error('体验名额数据异常，请刷新确认。');
  return {available:true,total:value.total,used:value.used,remaining:value.remaining,enabled:value.enabled,revision:value.revision};
}

export function mergeQuota(current, incoming) {
  const next=quotaSnapshot(incoming);
  return current && current.revision > next.revision ? current : next;
}
