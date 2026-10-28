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
let step = 0;
let lastRequest = null;
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

function syncBirthMode() {
  const mode = document.querySelector('input[name=mode]:checked')?.value || 'due_date';
  const dueDate = document.querySelector('input[name=dueDate]');
  const dueTime = document.querySelector('input[name=dueTime]');
  const birthDate = document.querySelector('input[name=birthDate]');
  const birthTime = document.querySelector('input[name=birthTime]');
  const birthHint = document.querySelector('#birthHint');
  const born = mode === 'born';
  dueDate.required = !born;
  dueTime.value = dueTime.value || '12:00';
  birthDate.required = born;
  birthTime.required = born;
  birthHint.textContent = born
    ? '已出生模式要求填写实际出生日期和准确时间；预产期可以同时保留，用于结果对照。实际出生日期不能晚于今天。'
    : '预产期可以是未来日期和时间；尚未出生时填写预产期即可，出生日期和准确时间可以之后补充。';
}

document.querySelectorAll('input[name=mode]').forEach((input) => input.addEventListener('change', () => { showMessage(''); syncBirthMode(); }));
syncBirthMode();

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
    if (birthDate && new Date(`${birthDate}T00:00:00`) > new Date()) {
      showMessage('实际出生日期不能晚于今天；预产期可以是未来时间。');
      return false;
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
  summary.className = 'summary';
  summary.innerHTML = `<div class="summary-intro"><strong>${escapeHTML(data.surname || '你的姓氏')} · 命名方向</strong><small>${escapeHTML(analysis.scenario || '命名参考')} · ${escapeHTML(analysis.gender || '未知')} · ${escapeHTML(data.place || '出生地待补充')}<br>${escapeHTML(due)} · ${escapeHTML(actual)}</small></div><div class="metric"><b>${escapeHTML(analysis.primary)}</b><span>主要意象</span></div><div class="metric"><b>${escapeHTML(analysis.support)}</b><span>辅助意象</span></div><div class="metric"><b>${analysis.family ? '已纳入' : '参考'}</b><span>家庭线索</span></div><p class="method-note">${escapeHTML(analysis.method)}</p>`;
}

function renderCards(data, analysis) {
  const list = window.NameEngine.candidates(data, analysis);
  const freeList = list.slice(0, 3);
  if (!freeList.length) {
    cards.innerHTML = '<div class="empty-result">暂时没有匹配方案，请调整名的字数或偏好后重试。</div>';
    upgradePanel.hidden = true;
    return 0;
  }
  cards.innerHTML = freeList.map((item) => {
    const fullName = escapeHTML(item.fullName);
    const isSaved = saved.includes(item.fullName);
    return `<article class="card"><span class="rank">0${item.rank} / FREE PREVIEW</span><h3>${fullName}</h3><div class="pinyin">${escapeHTML(data.surname || '林')} · ${escapeHTML(item.pinyin)}</div><p class="meaning">${escapeHTML(item.meaning)}</p><div class="chips">${item.tags.map((tag) => `<span>${escapeHTML(tag)}</span>`).join('')}</div><details><summary>查看易经、阴阳五行依据</summary><p>${escapeHTML(item.elementEvidence)}</p><p>${escapeHTML(item.guaEvidence)}</p><p>${escapeHTML(item.yinyangEvidence)}</p><p>${escapeHTML(item.scoreEvidence)}</p><p>${escapeHTML(item.source)}</p><p>${escapeHTML(item.analysis)}</p><small class="evidence-disclaimer">依据状态：演示规则 / 部分资料待人工核验</small></details><div class="card-foot"><span class="score">${escapeHTML(item.score)} <small>/ 100</small></span><button class="save ${isSaved ? 'saved' : ''}" data-name="${fullName}" type="button">${isSaved ? '已收藏' : '收藏 ♡'}</button></div></article>`;
  }).join('');
  upgradePanel.hidden = false;
  upgradePanel.innerHTML = `<div><strong>已展示 ${freeList.length} 个免费候选</strong><p>解锁完整报告，查看更多候选、评分明细、音形检查和可下载方案。</p></div><a class="primary" href="#pricing">查看完整方案 <span>→</span></a>`;
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
  lastRequest = data;
  const submit = form.querySelector('button[type=submit]');
  const originalLabel = submit.textContent;
  submit.disabled = true;
  submit.textContent = '正在整理…';
  showMessage('');
  try {
    const analysis = await requestAnalysis(data);
    renderSummary(data, analysis);
    const freeCount = renderCards(data, analysis);
    resultStatus.textContent = `已生成 ${freeCount} 个免费方向，可展开卡片查看传统依据。`;
    document.querySelector('#results').scrollIntoView({ behavior: 'smooth' });
    showToast('名字方案已生成，先收藏喜欢的方向。');
  } catch (error) {
    showMessage(error.message || '暂时无法生成方案，请检查出生信息后重试。');
  } finally {
    submit.disabled = false;
    submit.textContent = originalLabel;
  }
});

regenerate.addEventListener('click', () => {
  if (lastRequest) {
    const analysis = window.NameEngine.analyze(lastRequest);
    renderSummary(lastRequest, analysis);
    const freeCount = renderCards(lastRequest, analysis);
    resultStatus.textContent = `已按当前信息重新整理 ${freeCount} 个方案。`;
    showToast('已重新整理名字方向。');
    return;
  }
  document.querySelector('#form').scrollIntoView({ behavior: 'smooth' });
  showToast('先完成上方信息，就能生成名字方案。', 'info');
});

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
