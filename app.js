const form = document.querySelector('#namingForm');
const panels = [...document.querySelectorAll('.panel')];
const steps = [...document.querySelectorAll('.progress span')];
const summary = document.querySelector('#summary');
const cards = document.querySelector('#cards');
const count = document.querySelector('#savedCount');
const regenerate = document.querySelector('#regenerate');
let step = 0;
let lastRequest = null;
let saved = JSON.parse(localStorage.getItem('序名收藏') || '[]');

function syncBirthMode() {
  const mode = document.querySelector('input[name=mode]:checked')?.value || 'due_date';
  const dateLabel = document.querySelector('#dateLabel');
  const timeLabel = document.querySelector('#timeLabel');
  const birthHint = document.querySelector('#birthHint');
  const time = document.querySelector('input[name=time]');
  const due = mode === 'due_date';
  dateLabel.textContent = due ? '预产期日期' : '出生日期';
  timeLabel.textContent = due ? '预产期参考时间' : '准确出生时间';
  birthHint.textContent = due ? '预产期模式会使用预产期和 12:00 作为默认参考；出生后请切换到“已出生起名”并填写准确时间。当前原型使用标准时间计算。' : '已出生模式使用出生日期和准确时间；如果时间未知，请选择预产期模式作为参考。当前原型使用标准时间计算。';
  if (due && !time.value) time.value = '12:00';
  time.required = !due;
}

document.querySelectorAll('input[name=mode]').forEach((input) => input.addEventListener('change', syncBirthMode));
syncBirthMode();

function setStep(next) {
  step = Math.max(0, Math.min(next, panels.length - 1));
  panels.forEach((panel, index) => panel.classList.toggle('active', index === step));
  steps.forEach((item, index) => item.classList.toggle('active', index <= step));
}

document.querySelectorAll('.next').forEach((button) => button.addEventListener('click', () => {
  const invalid = [...panels[step].querySelectorAll('input,select,textarea')].find((field) => !field.checkValidity());
  if (invalid) { invalid.reportValidity(); return; }
  setStep(step + 1);
}));
document.querySelectorAll('.back').forEach((button) => button.addEventListener('click', () => setStep(step - 1)));

function renderSummary(data, analysis) {
  summary.className = 'summary';
  summary.innerHTML = `<div class="summary-intro"><strong>${data.surname || '你的姓氏'} · 命名方向</strong><small>${analysis.scenario || '命名参考'} · ${analysis.gender || '未知'} · ${analysis.primary}意象为主，辅以${analysis.support}的气质 · ${data.place || '出生地待补充'} · ${analysis.time || '时间待补充'}</small></div><div class="metric"><b>${analysis.primary}</b><span>主要意象</span></div><div class="metric"><b>${analysis.support}</b><span>辅助意象</span></div><div class="metric"><b>${analysis.family ? '已纳入' : '参考'}</b><span>家庭线索</span></div><p class="method-note">${analysis.method}</p>`;
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
    if (!response.ok) throw new Error('analysis request failed');
    const payload = await response.json();
    if (!payload.analysis) throw new Error('analysis response incomplete');
    return payload.analysis;
  } catch (error) {
    return window.NameEngine.analyze(data);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const birthDate = data.date ? new Date(`${data.date}T00:00:00`) : null;
  if (birthDate && birthDate > new Date()) { alert('出生日期不能晚于今天。'); return; }
  data.styles = [...document.querySelectorAll('input[name=style]:checked')].map((item) => item.value);
  lastRequest = data;
  const submit = form.querySelector('button[type=submit]');
  const originalLabel = submit.textContent;
  submit.disabled = true;
  submit.textContent = '正在整理…';
  const analysis = await requestAnalysis(data);
  submit.disabled = false;
  submit.textContent = originalLabel;
  renderSummary(data, analysis);
  renderCards(data, analysis);
  document.querySelector('#results').scrollIntoView({ behavior: 'smooth' });
});
regenerate.addEventListener('click', () => {
  if (lastRequest) { const analysis = window.NameEngine.analyze(lastRequest); renderCards(lastRequest, analysis); return; }
  document.querySelector('#form').scrollIntoView({ behavior: 'smooth' });
});
count.textContent = saved.length;

const savedButton = document.querySelector('#savedButton');
const clearData = document.querySelector('#clearData');
savedButton?.addEventListener('click', () => document.querySelector('#results').scrollIntoView({ behavior: 'smooth' }));
clearData?.addEventListener('click', () => { if (!saved.length || window.confirm('清除本地收藏？此操作无法撤销。')) { saved = []; localStorage.removeItem('序名收藏'); count.textContent = '0'; document.querySelectorAll('.save.saved').forEach((button) => { button.classList.remove('saved'); button.textContent = '收藏 ♡'; }); } });
