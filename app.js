const form = document.querySelector('#namingForm');
const panels = [...document.querySelectorAll('.panel')];
const steps = [...document.querySelectorAll('.progress span')];
const summary = document.querySelector('#summary');
const cards = document.querySelector('#cards');
const count = document.querySelector('#savedCount');
const regenerate = document.querySelector('#regenerate');
const formMessage = document.querySelector('#formMessage');
let step = 0;
let lastRequest = null;
let saved = JSON.parse(localStorage.getItem('序名收藏') || '[]');

function showMessage(message, type = 'error') {
  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`;
  formMessage.hidden = !message;
  if (message) formMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

function validatePanel() {
  const invalid = [...panels[step].querySelectorAll('input,select,textarea')].find((field) => !field.checkValidity());
  if (invalid) {
    showMessage(`请先填写“${invalid.closest('label')?.innerText?.split('\n')[0] || '必填项'}”。`);
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
  steps.forEach((item, index) => item.classList.toggle('active', index <= step));
  if (step === 1) syncBirthMode();
}

function renderSummary(data, analysis) {
  const due = analysis.due_date ? `预产期 ${analysis.due_date} ${analysis.due_time || '12:00'}` : '未填写预产期';
  const actual = analysis.birth_date ? `出生 ${analysis.birth_date} ${analysis.birth_time || '时间待补充'}` : '尚未填写实际出生信息';
  summary.className = 'summary';
  summary.innerHTML = `<div class="summary-intro"><strong>${data.surname || '你的姓氏'} · 命名方向</strong><small>${analysis.scenario || '命名参考'} · ${analysis.gender || '未知'} · ${data.place || '出生地待补充'}<br>${due} · ${actual}</small></div><div class="metric"><b>${analysis.primary}</b><span>主要意象</span></div><div class="metric"><b>${analysis.support}</b><span>辅助意象</span></div><div class="metric"><b>${analysis.family ? '已纳入' : '参考'}</b><span>家庭线索</span></div><p class="method-note">${analysis.method}</p>`;
}

function renderCards(data, analysis) {
  const list = window.NameEngine.candidates(data, analysis);
  cards.innerHTML = list.map((item) => `<article class="card"><span class="rank">0${item.rank} / SHORTLIST</span><h3>${item.fullName}</h3><div class="pinyin">${data.surname || '林'} · ${item.pinyin}</div><p class="meaning">${item.meaning}</p><div class="chips">${item.tags.map((tag) => `<span>${tag}</span>`).join('')}</div><details><summary>查看分析依据</summary><p>${item.source}</p><p>${item.analysis}</p></details><div class="card-foot"><span class="score">${item.score} <small>/ 100</small></span><button class="save ${saved.includes(item.fullName) ? 'saved' : ''}" data-name="${item.fullName}" type="button">${saved.includes(item.fullName) ? '已收藏' : '收藏 ♡'}</button></div></article>`).join('');
  cards.querySelectorAll('.save').forEach((button) => button.addEventListener('click', () => {
    const name = button.dataset.name;
    saved = saved.includes(name) ? saved.filter((item) => item !== name) : [...saved, name];
    localStorage.setItem('序名收藏', JSON.stringify(saved));
    button.classList.toggle('saved', saved.includes(name));
    button.textContent = saved.includes(name) ? '已收藏' : '收藏 ♡';
    count.textContent = saved.length;
  }));
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
    renderCards(data, analysis);
    document.querySelector('#results').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    showMessage(error.message || '暂时无法生成方案，请检查出生信息后重试。');
  } finally {
    submit.disabled = false;
    submit.textContent = originalLabel;
  }
});

regenerate.addEventListener('click', () => {
  if (lastRequest) { const analysis = window.NameEngine.analyze(lastRequest); renderSummary(lastRequest, analysis); renderCards(lastRequest, analysis); return; }
  document.querySelector('#form').scrollIntoView({ behavior: 'smooth' });
});
count.textContent = saved.length;

const savedButton = document.querySelector('#savedButton');
const clearData = document.querySelector('#clearData');
savedButton?.addEventListener('click', () => document.querySelector('#results').scrollIntoView({ behavior: 'smooth' }));
clearData?.addEventListener('click', () => { saved = []; localStorage.removeItem('序名收藏'); count.textContent = '0'; document.querySelectorAll('.save.saved').forEach((button) => { button.classList.remove('saved'); button.textContent = '收藏 ♡'; }); showMessage('本地收藏已清除。', 'success'); });
