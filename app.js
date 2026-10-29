const form = document.querySelector('#namingForm');
const panels = [...document.querySelectorAll('.panel')];
const steps = [...document.querySelectorAll('.progress span')];
const summary = document.querySelector('#summary');
const cards = document.querySelector('#cards');
const count = document.querySelector('#savedCount');
const regenerate = document.querySelector('#regenerate');
const formMessage = document.querySelector('#formMessage');
const upgradePanel = document.querySelector('#upgradePanel');
const planGrid = document.querySelector('#planGrid');
const resultStatus = document.querySelector('#resultStatus');
const toast = document.querySelector('#toast');
const lengthInput = document.querySelector('select[name=length]');
const candidateCountInput = document.querySelector('input[name=candidateCount]');
const candidateCountHint = document.querySelector('#candidateCountHint');
const currentNameField = document.querySelector('#currentNameField');
const currentNameInput = document.querySelector('input[name=currentName]');
const downloadReport = document.querySelector('#downloadReport');
let step = 0;
let lastRequest = null;
let lastAnalysis = null;
let lastCandidates = [];
let toastTimer;
let saved = [];
try {
  const stored = JSON.parse(localStorage.getItem('序名收藏') || '[]');
  saved = Array.isArray(stored) ? stored.filter((item) => typeof item === 'string') : [];
} catch (error) {
  saved = [];
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function showToast(message, type = 'success') {
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3200);
}

function showMessage(message, type = 'error', scroll = true) {
  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`;
  formMessage.hidden = !message;
  if (message && scroll) formMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function syncCandidateCountLimit() {
  if (!lengthInput || !candidateCountInput || !candidateCountHint) return;
  const length = Number(lengthInput.value || 2);
  const available = window.NameEngine?.countForLength?.(length) || 11;
  const max = Math.max(1, Math.min(11, available));
  candidateCountInput.max = String(max);
  const current = Number.parseInt(candidateCountInput.value || '3', 10);
  if (!Number.isInteger(current) || current < 1) candidateCountInput.value = '1';
  if (current > max) candidateCountInput.value = String(max);
  candidateCountHint.textContent = `当前${length === 1 ? '单字名' : length === 2 ? '两字名' : '三字名'}可生成 1–${max} 个，候选资料仍待核验。`;
}

function syncBirthMode() {
  const mode = document.querySelector('input[name=mode]:checked')?.value || 'due_date';
  const dueDate = document.querySelector('input[name=dueDate]');
  const dueTime = document.querySelector('input[name=dueTime]');
  const birthDate = document.querySelector('input[name=birthDate]');
  const birthTime = document.querySelector('input[name=birthTime]');
  const birthHint = document.querySelector('#birthHint');
  const purpose = document.querySelector('input[name=purpose]:checked')?.value || 'newborn';
  const born = mode === 'born';
  if (currentNameField) {
    currentNameField.hidden = purpose !== 'rename';
    currentNameField.setAttribute('aria-hidden', String(purpose !== 'rename'));
    if (currentNameInput) currentNameInput.disabled = purpose !== 'rename';
  }
  dueDate.required = !born;
  dueTime.value = dueTime.value || '12:00';
  birthDate.required = born;
  birthTime.required = born;
  birthHint.textContent = purpose === 'rename'
    ? '成人改名按已出生信息整理，填写实际出生日期和准确时间；预产期可留空。'
    : born
      ? '已出生模式要求填写实际出生日期和准确时间；预产期可以同时保留，用于结果对照。实际出生日期不能晚于今天。'
      : '预产期可以是未来日期和时间；尚未出生时填写预产期即可，出生日期和准确时间可以之后补充。';
}

document.querySelectorAll('input[name=mode]').forEach((input) => input.addEventListener('change', () => { showMessage(''); syncBirthMode(); }));
document.querySelectorAll('input[name=purpose]').forEach((input) => input.addEventListener('change', () => {
  if (input.value === 'rename') {
    document.querySelector('input[name=mode][value=born]').checked = true;
    showToast('成人改名已切换到已出生信息流程。', 'info');
  }
  showMessage('');
  syncBirthMode();
}));
syncBirthMode();
syncCandidateCountLimit();
lengthInput?.addEventListener('change', syncCandidateCountLimit);

function getClockInZone(zone) {
  try {
    const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return { date: `${values.year}-${values.month}-${values.day}`, minutes: Number(values.hour) * 60 + Number(values.minute) };
  } catch (error) {
    const now = new Date();
    return { date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`, minutes: now.getHours() * 60 + now.getMinutes() };
  }
}

function labelName(field) {
  const label = field.closest('label');
  if (!label) return '必填项';
  const span = label.querySelector('span');
  if (span) return span.textContent.trim();
  const text = [...label.childNodes].find((node) => node.nodeType === 3 && node.textContent.trim());
  return text?.textContent.trim() || '必填项';
}

function validatePanel() {
  const invalid = [...panels[step].querySelectorAll('input,select,textarea')].find((field) => !field.checkValidity());
  if (invalid) {
    showMessage(`请先补充“${labelName(invalid)}”。`);
    invalid.focus();
    return false;
  }
  if (step === 1) {
    const mode = document.querySelector('input[name=mode]:checked')?.value;
    const birthDate = document.querySelector('input[name=birthDate]').value;
    const birthTime = document.querySelector('input[name=birthTime]').value;
    if ((birthDate && !birthTime) || (!birthDate && birthTime)) {
      showMessage('出生日期和准确出生时间需要同时填写；如果尚未出生，可以都留空。');
      return false;
    }
    if (mode === 'born' && (!birthDate || !birthTime)) {
      showMessage('已出生起名需要填写出生日期和准确出生时间。');
      return false;
    }
    const zone = document.querySelector('select[name=zone]')?.value || 'Asia/Shanghai';
    const clock = getClockInZone(zone);
    if (birthDate && birthDate > clock.date) {
      showMessage('实际出生日期不能晚于今天；预产期可以是未来时间。');
      return false;
    }
    if (birthDate && birthDate === clock.date && birthTime) {
      const [hours, minutes] = birthTime.split(':').map(Number);
      if (hours * 60 + minutes > clock.minutes) {
        showMessage('出生时间不能晚于当前时间；预产期可以填写未来时间。');
        return false;
      }
    }
  }
  showMessage('');
  return true;
}

document.querySelectorAll('.next').forEach((button) => button.addEventListener('click', () => {
  if (validatePanel()) setStep(step + 1);
}));
document.querySelectorAll('.back').forEach((button) => button.addEventListener('click', () => { showMessage(''); setStep(step - 1); }));

function setStep(next) {
  step = Math.max(0, Math.min(next, panels.length - 1));
  panels.forEach((panel, index) => panel.classList.toggle('active', index === step));
  steps.forEach((item, index) => {
    item.classList.toggle('active', index <= step);
    if (index === step) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
  if (step === 1) syncBirthMode();
}

function renderSummary(data, analysis) {
  const due = analysis.due_date ? `预产期 ${analysis.due_date} ${analysis.due_time || '12:00'}` : '未填写预产期';
  const actual = analysis.birth_date ? `出生 ${analysis.birth_date} ${analysis.birth_time || '时间待补充'}` : '尚未填写实际出生信息';
  const purpose = analysis.purpose || (data.purpose === 'rename' ? '成人改名' : '新生儿起名');
  const zone = analysis.zone_label || analysis.zone || data.zone || '中国标准时间 UTC+8';
  const currentName = analysis.current_name || data.currentName || '';
  const currentNameNote = currentName ? `现用姓名 ${currentName} · ` : '';
  summary.className = 'summary';
  summary.innerHTML = `<div class="summary-intro"><strong>${escapeHTML(data.surname || '你的姓氏')} · ${escapeHTML(purpose)}</strong><small>${escapeHTML(analysis.scenario || '命名参考')} · ${escapeHTML(analysis.gender || '未知')} · ${escapeHTML(currentNameNote)}${escapeHTML(data.place || '出生地待补充')} · ${escapeHTML(zone)}<br>${escapeHTML(due)} · ${escapeHTML(actual)}</small></div><div class="metric"><b>${escapeHTML(analysis.primary)}</b><span>演示意象</span></div><div class="metric"><b>${escapeHTML(analysis.support)}</b><span>演示辅助</span></div><div class="metric"><b>${analysis.family ? '已纳入' : '参考'}</b><span>家庭线索</span></div><p class="method-note">${escapeHTML(analysis.method)}</p>`;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (error) {
      // Some browsers block clipboard access outside a secure context.
    }
  }
  const helper = document.createElement('textarea');
  helper.value = value;
  helper.setAttribute('readonly', '');
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  document.body.appendChild(helper);
  try {
    helper.select();
    return typeof document.execCommand === 'function' && document.execCommand('copy');
  } finally {
    helper.remove();
  }
}

function renderCards(data, analysis) {
  const list = window.NameEngine.candidates(data, analysis);
  lastCandidates = list;
  const freeList = list;
  if (!freeList.length) {
    cards.innerHTML = '<div class="empty-result">暂时没有匹配方案，请调整名的字数或偏好后重试。</div>';
    upgradePanel.hidden = true;
    return 0;
  }
  cards.innerHTML = freeList.map((item) => {
    const fullName = escapeHTML(item.fullName);
    const isSaved = saved.includes(item.fullName);
    return `<article class="card"><span class="rank">${String(item.rank).padStart(2, '0')} / FREE PREVIEW</span><h3>${fullName}</h3><div class="pinyin">${escapeHTML(data.surname || '林')} · ${escapeHTML(item.pinyin)}</div><p class="meaning">${escapeHTML(item.meaning)}</p><div class="chips">${item.tags.map((tag) => `<span>${escapeHTML(tag)}</span>`).join('')}</div><details><summary>查看演示意象与资料状态</summary><p>${escapeHTML(item.elementEvidence)}</p><p>${escapeHTML(item.guaEvidence)}</p><p>${escapeHTML(item.yinyangEvidence)}</p><p>${escapeHTML(item.scoreEvidence)}</p><p>${escapeHTML(item.source)}</p><p>${escapeHTML(item.analysis)}</p><small class="evidence-disclaimer">演示数据：并非四柱排盘或由出生信息起卦，资料待核验</small></details><div class="card-foot"><span class="score">演示评分 ${escapeHTML(item.score)} <small>/ 100</small></span><div class="card-tools"><button class="copy-name" data-name="${fullName}" type="button">复制名字</button><button class="save ${isSaved ? 'saved' : ''}" data-name="${fullName}" type="button">${isSaved ? '已收藏' : '收藏 ♡'}</button></div></div></article>`;
  }).join('');
  upgradePanel.hidden = false;
  upgradePanel.innerHTML = `<div><strong>已展示 ${freeList.length} 个候选</strong><p>解锁完整报告，查看更多候选、评分明细、音形检查和可下载方案。</p></div><a class="primary" href="#pricing">查看完整方案 <span>→</span></a>`;
  cards.querySelectorAll('.copy-name').forEach((button) => button.addEventListener('click', async () => {
    const name = button.dataset.name;
    try {
      if (!await copyText(name)) throw new Error('copy failed');
      showToast(`已复制${name}，可以发给家人讨论。`);
    } catch (error) {
      showToast('复制失败，请长按名字手动复制。', 'info');
    }
  }));
  cards.querySelectorAll('.save').forEach((button) => button.addEventListener('click', () => {
    const name = button.dataset.name;
    saved = saved.includes(name) ? saved.filter((item) => item !== name) : [...saved, name];
    localStorage.setItem('序名收藏', JSON.stringify(saved));
    const nowSaved = saved.includes(name);
    button.classList.toggle('saved', nowSaved);
    button.textContent = nowSaved ? '已收藏' : '收藏 ♡';
    count.textContent = saved.length;
    showToast(nowSaved ? `已收藏${name}` : `已取消收藏${name}`);
  }));
  return freeList.length;
}

function renderPlans(product) {
  const plans = product.plans || [];
  planGrid.innerHTML = plans.map((plan, index) => `<article class="plan ${index === 1 ? 'featured' : ''}">${index === 1 ? '<span class="plan-badge">MOST CHOSEN</span>' : ''}<h3>${escapeHTML(plan.name)}</h3><div class="plan-price">${escapeHTML(plan.price)}</div><p>${escapeHTML(plan.description)}</p><ul>${(plan.benefits || []).map((benefit) => `<li>${escapeHTML(benefit)}</li>`).join('')}</ul><button class="${index === 0 ? 'secondary' : 'primary'} plan-action" type="button" data-plan="${escapeHTML(plan.id)}">${index === 0 ? '当前免费' : '了解方案'}</button></article>`).join('');
  planGrid.querySelectorAll('.plan-action').forEach((button) => button.addEventListener('click', () => {
    const plan = plans.find((item) => item.id === button.dataset.plan);
    showToast(plan?.id === 'free_preview' ? '免费预览已经在上方生成，可以先收藏喜欢的名字。' : (product.payment_status || '支付服务即将接入，方案权益已准备好。'), plan?.id === 'free_preview' ? 'success' : 'info');
  }));
}

async function loadProduct() {
  try {
    const response = await fetch('/api/product');
    if (!response.ok) throw new Error('product api unavailable');
    renderPlans(await response.json());
  } catch (error) {
    try { const response = await fetch('./data/product.json'); renderPlans(await response.json()); } catch (fallbackError) { /* Product cards are optional for a static preview. */ }
  }
}

function friendlyError(message) {
  const text = String(message || '');
  const rules = [
    [/surname must contain one or two characters/i, '姓氏需要填写 1–2 个汉字。'],
    [/mode must be due_date or born/i, '请选择预产期或已出生流程。'],
    [/purpose must be newborn or rename/i, '请选择新生儿起名或成人改名。'],
    [/rename purpose requires born mode/i, '成人改名需要使用已出生信息流程。'],
    [/gender must be male, female, or unknown/i, '性别请选择男、女或未知。'],
    [/zone must be/i, '请选择列表中的时区。'],
    [/dueDate is required/i, '预产期流程需要填写预产期日期。'],
    [/birthDate and exact birthTime are required/i, '已出生流程需要填写出生日期和准确时间。'],
    [/birthDate and birthTime must be supplied together/i, '出生日期和准确出生时间需要同时填写。'],
    [/actual birth date cannot be in the future/i, '实际出生日期不能晚于今天。'],
    [/birthTime cannot be in the future/i, '出生时间不能晚于当前时间。'],
    [/dueTime must use/i, '预产期时间格式不正确，请重新选择。'],
    [/birthTime must use/i, '出生时间格式不正确，请重新选择。'],
    [/length must be/i, '名字字数请选择 1–3 个字。'],
    [/candidateCount must be/i, '生成数量需要填写 1–11 个整数。'],
    [/place is required/i, '请填写出生地点，便于生成地域和时区参考。'],
    [/currentName must be/i, '现用姓名最多填写 20 个字符。'],
    [/request too large/i, '提交内容过大，请减少文字后重试。'],
  ];
  const match = rules.find(([pattern]) => pattern.test(text));
  return match ? match[1] : (text || '暂时无法生成方案，请稍后重试。');
}

async function requestAnalysis(data) {
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '分析请求未通过校验');
    if (!payload.analysis) throw new Error('分析结果不完整');
    return payload.analysis;
  } catch (error) {
    if (error instanceof TypeError) return window.NameEngine.analyze(data);
    throw error;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validatePanel()) return;
  const data = Object.fromEntries(new FormData(form));
  data.styles = [...document.querySelectorAll('input[name=style]:checked')].map((item) => item.value);
  data.variant = 0;
  lastRequest = data;
  lastAnalysis = null;
  lastCandidates = [];
  downloadReport.disabled = true;
  const submit = form.querySelector('button[type=submit]');
  const originalLabel = submit.textContent;
  submit.disabled = true;
  submit.textContent = '正在整理…';
  showMessage('');
  try {
    const analysis = await requestAnalysis(data);
    lastAnalysis = analysis;
    downloadReport.disabled = false;
    renderSummary(data, analysis);
    const freeCount = renderCards(data, analysis);
    const requestedCount = Number(data.candidateCount || 3);
    resultStatus.textContent = `已生成 ${freeCount} 个方向，可展开卡片查看演示意象及资料状态。${freeCount < requestedCount ? `当前字数的演示字库仅匹配 ${freeCount} 个。` : ''}`;
    document.querySelector('#results').scrollIntoView({ behavior: 'smooth' });
    showToast('名字方案已生成，先收藏喜欢的方向。');
  } catch (error) {
    showMessage(friendlyError(error.message || ''));
  } finally {
    submit.disabled = false;
    submit.textContent = originalLabel;
  }
});

regenerate.addEventListener('click', () => {
  if (lastRequest) {
    lastRequest = { ...lastRequest, variant: (Number(lastRequest.variant) || 0) + 1 };
    const analysis = window.NameEngine.analyze(lastRequest);
    lastAnalysis = analysis;
    downloadReport.disabled = false;
    renderSummary(lastRequest, analysis);
    const freeCount = renderCards(lastRequest, analysis);
    const requestedCount = Number(lastRequest.candidateCount || 3);
    resultStatus.textContent = `已按第 ${lastRequest.variant} 轮重新整理 ${freeCount} 个方案。${freeCount < requestedCount ? `当前字数的演示字库仅匹配 ${freeCount} 个。` : ''}`;
    showToast('已换一组候选方向，可下载当前方案。');
    return;
  }
  document.querySelector('#form').scrollIntoView({ behavior: 'smooth' });
  showToast('先完成上方信息，就能生成名字方案。', 'info');
});

function downloadReportFile() {
  if (!lastRequest || !lastCandidates.length) {
    showToast('先生成名字方案，再下载命名记录。', 'info');
    return;
  }
  const analysis = lastAnalysis || window.NameEngine.analyze(lastRequest);
  const lines = [
    '# 序名 · 命名参考方案',
    '',
    `姓氏：${lastRequest.surname || '未填写'}`,
    `用途：${analysis.purpose || (lastRequest.purpose === 'rename' ? '成人改名' : '新生儿起名')}`,
    `现用姓名：${analysis.current_name || lastRequest.currentName || '未填写'}`,
    `场景：${analysis.scenario || '命名参考'}`,
    `性别：${analysis.gender || '未知'}`,
    `出生地点：${lastRequest.place || '未填写'}`,
    `时区：${analysis.zone_label || analysis.zone || lastRequest.zone || '中国标准时间 UTC+8'}`,
    `预产期：${analysis.due_date ? `${analysis.due_date} ${analysis.due_time || '12:00'}` : '未填写'}`,
    `出生信息：${analysis.birth_date ? `${analysis.birth_date} ${analysis.birth_time || '时间待补充'}` : '尚未填写'}`,
    `候选数量：${lastCandidates.length}`,
    '',
    `说明：${analysis.method || '传统文化参考，不承诺确定性运势结果。'}`,
    '',
    '## 候选名字',
    ''
  ];
  lastCandidates.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.fullName}`);
    lines.push(`- 拼音：${item.pinyin}`);
    lines.push(`- 寓意：${item.meaning}`);
    lines.push(`- 标签：${item.tags.join('、')}`);
    lines.push(`- 演示评分：${item.score}/100`);
    lines.push(`- 演示意象：${item.elementEvidence}`);
    lines.push(`- 易经象意：${item.guaEvidence}`);
    lines.push(`- 阴阳：${item.yinyangEvidence}`);
    lines.push(`- 评分构成：${item.scoreEvidence}`);
    lines.push(`- 资料状态：演示规则，部分资料待人工核验`);
    lines.push('');
  });
  const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeSurname = String(lastRequest.surname || '方案').replace(/[^\u4e00-\u9fa5A-Za-z0-9_-]/g, '');
  link.href = url;
  link.download = `序名-${safeSurname || '方案'}.md`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('命名方案已下载到本地。');
}

downloadReport?.addEventListener('click', downloadReportFile);
count.textContent = saved.length;
loadProduct();

const savedButton = document.querySelector('#savedButton');
const clearData = document.querySelector('#clearData');
savedButton?.addEventListener('click', () => {
  document.querySelector('#results').scrollIntoView({ behavior: 'smooth' });
  showToast(saved.length ? `已收藏 ${saved.length} 个名字` : '完成一次生成后，就可以收藏喜欢的名字。', 'info');
});
clearData?.addEventListener('click', () => {
  saved = [];
  localStorage.removeItem('序名收藏');
  count.textContent = '0';
  document.querySelectorAll('.save.saved').forEach((button) => { button.classList.remove('saved'); button.textContent = '收藏 ♡'; });
  showToast('本地收藏已清除。');
});
