// Legacy entry point: refuse mixed HTML/script releases before attaching actions.
(function () {
const legacyForm = document.querySelector('#namingForm');
if (!legacyForm) return;
legacyForm.noValidate = true;
const requiredIds = ['summary','cards','savedCount','regenerate','formMessage','upgradePanel','planGrid','resultStatus','downloadReport','savedPanel','savedList','keepsakeName','keepsakeWish','keepsakeCanvas','keepsakeMessage','shareSite','downloadKeepsake','copySiteLink','siteLink','shareHint'];
const requiredFields = ['surname','candidateCount','dueDate','dueTime','birthDate','birthTime','place','zone','length'];
if (requiredIds.some(id => !document.getElementById(id)) || requiredFields.some(name => !legacyForm.elements.namedItem(name))) {
  const notice = document.createElement('div');
  notice.className = 'form-message legacy-version-notice';
  notice.id = 'legacyVersionNotice';
  notice.setAttribute('role', 'alert');
  const title = document.createElement('strong'); title.textContent = '页面与程序版本不一致，暂时无法生成方案。';
  const detail = document.createElement('p'); detail.textContent = '请刷新获取完整页面；如果仍然出现此提示，需要在服务器构建前端并重启正确的应用服务。刷新可能需要重新填写本次信息，本地收藏不会删除。';
  const reload = document.createElement('button'); reload.type = 'button'; reload.textContent = '刷新完整页面';
  reload.addEventListener('click', async () => {
    reload.disabled = true; reload.textContent = '正在刷新…';
    try {
      if ('caches' in window) await Promise.all((await caches.keys()).filter(key => key.startsWith('xuming-mvp-') || key.startsWith('xuming-react-')).map(key => caches.delete(key)));
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration('/');
        if (registration && [registration.active,registration.waiting,registration.installing].some(worker => worker && new URL(worker.scriptURL).pathname === '/service-worker.js')) await registration.unregister();
      }
    } catch (_) { /* Still request a fresh document if cache cleanup is unavailable. */ }
    const url = new URL('/', location.href); url.searchParams.set('app_refresh', String(Date.now())); location.replace(url.href);
  });
  notice.append(title, detail, reload); legacyForm.prepend(notice);
  legacyForm.addEventListener('submit', event => { event.preventDefault(); notice.scrollIntoView({block:'center'}); });
  return;
}
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
const savedPanel = document.querySelector('#savedPanel');
const savedList = document.querySelector('#savedList');
let step = 0;
let lastRequest = null;
let lastAnalysis = null;
let lastCandidates = [];
let toastTimer;
let saved = [];
let savedDetails = Object.create(null);
try {
  const stored = JSON.parse(localStorage.getItem('序名收藏') || '[]');
  saved = Array.isArray(stored) ? stored.filter((item) => typeof item === 'string') : [];
} catch (error) {
  saved = [];
}
try {
  const details = JSON.parse(localStorage.getItem('序名收藏详情') || '{}');
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    for (const name of saved) {
      const entry = details[name];
      if (entry && typeof entry.pinyin === 'string' && typeof entry.meaning === 'string') {
        savedDetails[name] = { pinyin: entry.pinyin, meaning: entry.meaning, source_status: entry.source_status };
      }
    }
  }
} catch (error) {
  savedDetails = Object.create(null);
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

function scrollBehavior() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function showMessage(message, type = 'error', scroll = true) {
  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`;
  formMessage.hidden = !message;
  if (message && scroll) formMessage.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
}

function renderSaved() {
  count.textContent = String(saved.length);
  savedList.innerHTML = saved.length ? saved.map((name) => {
    const detail = savedDetails[name];
    return `<div class="saved-item"><div><b>${escapeHTML(name)}</b>${detail ? `<small>${escapeHTML(detail.pinyin)}</small><p>${escapeHTML(detail.meaning)}</p><small>${detail.source_status === 'verified' ? '寓意资料已记录复核' : '寓意资料待核验'}</small>` : '<small>旧收藏仅记录名字，可重新生成后补充寓意。</small>'}</div><button type="button" class="remove-saved" data-name="${escapeHTML(name)}" aria-label="取消收藏 ${escapeHTML(name)}">移除</button></div>`;
  }).join('') : '<p class="saved-empty">还没有收藏名字。生成方案后，点击名字卡片上的“收藏”。</p>';
  cards.querySelectorAll('.save').forEach((button) => {
    const selected = saved.includes(button.dataset.name);
    button.classList.toggle('saved', selected);
    button.textContent = selected ? '已收藏' : '收藏 ♡';
  });
}

function persistSaved() {
  try {
    localStorage.setItem('序名收藏', JSON.stringify(saved));
    localStorage.setItem('序名收藏详情', JSON.stringify(savedDetails));
    return true;
  } catch (error) {
    showToast('当前浏览器无法保存收藏，本次收藏仅在页面打开期间有效。', 'info');
    return false;
  }
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
fetch('/api/name-counts').then((response) => {
  if (!response.ok) throw new Error('catalog unavailable');
  return response.json();
}).then((data) => { window.NameEngine.setCounts(data.counts); syncCandidateCountLimit(); }).catch(() => {
  candidateCountHint.textContent = '可请求 1–11 个；实际数量以服务端字库为准。';
});
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
  if (step === 0) {
    const surnameInput = form.querySelector('input[name=surname]');
    const characters = [...surnameInput.value.trim()];
    if (characters.length < 1 || characters.length > 2 || characters.some((char) => char !== '〇' && !/\p{Script=Han}/u.test(char))) {
      showMessage('姓氏请填写 1–2 个汉字，支持复姓。');
      surnameInput.focus();
      return false;
    }
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

function renderComparison(comparison) {
  if (!comparison) return '';
  if (comparison.error) return `<section class="bazi-comparison" aria-label="预产期与出生信息对照"><h3>预产期与实际出生对照</h3><p class="comparison-warning">预产期参考排盘暂不可用：${escapeHTML(comparison.error)} 实际出生排盘不受影响。</p></section>`;
  if (!comparison.reference || !Array.isArray(comparison.differences) || comparison.differences.length !== 4) return '';
  const rows = comparison.differences;
  const headings = rows.map(item => `<th scope="col">${escapeHTML(item.label)}</th>`).join('');
  const reference = rows.map(item => `<td>${escapeHTML(item.reference)}</td>`).join('');
  const actual = rows.map(item => `<td>${escapeHTML(item.actual)}</td>`).join('');
  const changed = rows.map(item => `<td class="${item.changed ? 'comparison-changed' : ''}">${item.changed ? '有变化' : '相同'}</td>`).join('');
  const referenceBoundary = comparison.reference.boundary;
  const boundary = referenceBoundary ? `<p class="comparison-warning">${escapeHTML(referenceBoundary.warning)} ${escapeHTML(referenceBoundary.term)} ${escapeHTML(referenceBoundary.local_time)}；交接前 ${escapeHTML(referenceBoundary.alternatives[0].year)}年 ${escapeHTML(referenceBoundary.alternatives[0].month)}月，交接后 ${escapeHTML(referenceBoundary.alternatives[1].year)}年 ${escapeHTML(referenceBoundary.alternatives[1].month)}月。</p>` : '';
  const boundaryNotice = comparison.near_boundary ? '<p class="comparison-warning">其中一组时间接近节气交接，年柱或月柱的对照结果可能随节气时刻核对而变化。</p>' : '';
  return `<section class="bazi-comparison" aria-label="预产期与出生信息对照"><div class="comparison-heading"><h3>预产期与实际出生对照</h3><span>${comparison.near_boundary ? '靠近节气，需复核' : comparison.has_changes ? '四柱中有变化' : '四柱相同'}</span></div><p>预产期参考 ${escapeHTML(comparison.reference.local_time)}；主排盘采用实际出生时间。</p><div class="comparison-table-wrap"><table><caption>预产期参考与实际出生的四柱对照</caption><thead><tr><th scope="col">时间依据</th>${headings}</tr></thead><tbody><tr><th scope="row">预产期参考</th>${reference}</tr><tr><th scope="row">实际出生</th>${actual}</tr><tr><th scope="row">对照</th>${changed}</tr></tbody></table></div>${boundaryNotice}${boundary}<p class="comparison-note">仅比较两次输入对应的四柱，不判断运势好坏；生辰起卦与选字采用主排盘时间。</p></section>`;
}

function renderSummary(data, analysis) {
  const chart = analysis.bazi;
  if (!chart || !Array.isArray(chart.pillars) || chart.pillars.length !== 4) throw new Error('历法服务未返回完整四柱，请重试。');
  const due = analysis.due_date ? `预产期 ${analysis.due_date} ${analysis.due_time || '12:00'}` : '未填写预产期';
  const actual = analysis.birth_date ? `出生 ${analysis.birth_date} ${analysis.birth_time}` : '尚未填写实际出生信息';
  const purpose = analysis.purpose || (data.purpose === 'rename' ? '成人改名' : '新生儿起名');
  const zone = analysis.zone_label || analysis.zone || data.zone || '中国标准时间 UTC+8';
  const currentNameNote = analysis.current_name ? `现用姓名 ${analysis.current_name} · ` : '';
  const pillarCards = chart.pillars.map(pillar => `<div class="pillar"><span>${escapeHTML(pillar.label)}</span><b>${escapeHTML(pillar.ganzhi)}</b><small>${escapeHTML(pillar.stem_element)} · ${escapeHTML(pillar.branch_element)}</small></div>`).join('');
  const counts = Object.entries(chart.element_counts).map(([element, count]) => `${element} ${count}`).join('　');
  const boundary = chart.boundary ? `<p class="boundary-notice">${escapeHTML(chart.boundary.warning)}<br>${escapeHTML(chart.boundary.term)} ${escapeHTML(chart.boundary.local_time)}；交接前 ${escapeHTML(chart.boundary.alternatives[0].year)}年 ${escapeHTML(chart.boundary.alternatives[0].month)}月，交接后 ${escapeHTML(chart.boundary.alternatives[1].year)}年 ${escapeHTML(chart.boundary.alternatives[1].month)}月。</p>` : '';
  const prior = chart.previous_jie ? `${chart.previous_jie.name} ${chart.previous_jie.local_time}` : '暂无';
  const next = chart.next_jie ? `${chart.next_jie.name} ${chart.next_jie.local_time}` : '暂无';
  summary.className = 'summary bazi-summary';
  summary.innerHTML = `<div class="summary-intro"><strong>${escapeHTML(data.surname || '你的姓氏')} · ${escapeHTML(purpose)}</strong><small>${escapeHTML(analysis.scenario)} · ${escapeHTML(analysis.gender)} · ${escapeHTML(currentNameNote)}${escapeHTML(data.place)} · ${escapeHTML(zone)}<br>${escapeHTML(due)} · ${escapeHTML(actual)}</small></div><div class="bazi-title"><b>四柱排盘 · ${chart.reference ? '预产期参考' : '实际出生'}</b><span>日主 ${escapeHTML(chart.day_master.stem)} · ${escapeHTML(chart.day_master.element)}</span></div><div class="pillars">${pillarCards}</div><p class="bazi-counts">表面八字五行计数：${escapeHTML(counts)}<br><small>仅计天干与地支各一项，不含藏干，不代表旺衰或喜用神。</small></p>${boundary}${renderComparison(analysis.bazi_comparison)}<details class="bazi-method"><summary>查看排盘口径与节气</summary><p>${escapeHTML(chart.conventions.join('；'))}。</p><p>前一节：${escapeHTML(prior)}；后一节：${escapeHTML(next)}。</p><p>历法引擎 ${escapeHTML(chart.source.library)} ${escapeHTML(chart.source.version)}；经跨库样本对照，权威机构认证尚未完成。</p></details><p class="method-note">${escapeHTML(analysis.method)}</p>`;
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

function readingNotes(pronunciation) {
  if (!pronunciation || !Array.isArray(pronunciation.surname) || !Array.isArray(pronunciation.given)) {
    return ['读音对照暂不可用，请自行核对。'];
  }
  const surname = pronunciation.surname.map((item) => `${item.character}：${item.readings.length ? item.readings.join(' / ') : '字典未收录'}`).join('；');
  const given = pronunciation.given.map((item) => {
    const result = item.status === 'listed' ? '字典列有此音' : item.status === 'unknown' ? '字典未收录' : '预设读音不在字典列表中，需复核';
    const alternatives = item.readings.length > 1 ? `；字典读音 ${item.readings.join(' / ')}` : '';
    return `${item.character}：${item.selected || '未填写'}（${result}${alternatives}）`;
  }).join('；');
  const notes = [`姓氏单字读音：${surname}。`, `名的读音对照：${given}。`];
  if (pronunciation.surname.some((item) => item.readings.length > 1)) notes.push('姓氏包含多音字；以上是字典单字读音，姓氏实际读法请按家族习惯核对。');
  if (pronunciation.surname_given_overlap?.length) notes.push(`姓和名中都有“${pronunciation.surname_given_overlap.join('、')}”，请结合全名读写习惯判断。`);
  notes.push(pronunciation.limitations);
  notes.push(`读音对照：${pronunciation.source.library} ${pronunciation.source.version}；预设读音和多音字用法仍需人工核对。`);
  return notes;
}

function renderCards(data, analysis, selected) {
  const list = window.NameEngine.candidates(data, analysis, selected);
  lastCandidates = list;
  const freeList = list;
  if (!freeList.length) {
    cards.innerHTML = '<div class="empty-result">没有符合避用字要求的候选。请减少避用字或调整名的字数，再重新生成。</div>';
    upgradePanel.hidden = true;
    return 0;
  }
  cards.innerHTML = freeList.map((item) => {
    const fullName = escapeHTML(item.fullName);
    const isSaved = saved.includes(item.fullName);
    const reading = readingNotes(item.pronunciation).map((note) => `<p>${escapeHTML(note)}</p>`).join('');
    return `<article class="card"><div class="card-top"><span class="rank">${String(item.rank).padStart(2, '0')} / 名字提案</span><span class="card-status">${item.source_status === 'verified' ? '寓意已复核' : '寓意待核验'}</span></div><h3>${fullName}</h3><div class="pinyin">姓氏 ${escapeHTML(data.surname || '林')} · 名 ${escapeHTML(item.pinyin)}</div><p class="meaning">${escapeHTML(item.meaning)}</p><div class="chips">${item.tags.map((tag) => `<span>${escapeHTML(tag)}</span>`).join('')}</div><details><summary>查看读音与字形提醒</summary>${reading}</details><details><summary>${item.ranking ? "查看选字依据与资料状态" : "查看演示意象与资料状态"}</summary><p>${escapeHTML(item.elementEvidence)}</p><p>${escapeHTML(item.guaEvidence)}</p><p>${escapeHTML(item.yinyangEvidence)}</p><p>${escapeHTML(item.scoreEvidence)}</p><p>寓意资料状态：${item.source_status === 'verified' ? '已记录复核' : '待核验'}；${escapeHTML(item.source)}</p><p>${escapeHTML(item.analysis)}</p><small class="evidence-disclaimer">${item.ranking ? "匹配值不代表运势；四柱与生辰起卦采用主排盘时间。" : "此旧版记录的评分和卦象为演示数据。"}</small></details><div class="card-foot"><span class="score">${item.ranking ? "偏好匹配" : "演示评分"} ${escapeHTML(item.score)} <small>/ 100</small></span><div class="card-tools"><button class="copy-name" data-name="${fullName}" type="button">复制名字</button><button class="make-keepsake" data-name="${fullName}" type="button">做心愿卡</button><button class="save ${isSaved ? 'saved' : ''}" data-name="${fullName}" type="button">${isSaved ? '已收藏' : '收藏 ♡'}</button></div></div></article>`;
  }).join('');
  upgradePanel.hidden = false;
  upgradePanel.innerHTML = `<div><strong>已展示 ${freeList.length} 个候选</strong><p>可以展开每个候选查看资料状态，收藏喜欢的名字或下载当前方案。</p></div><a class="primary" href="#pricing">查看服务状态 <span>→</span></a>`;
  cards.querySelectorAll('.copy-name').forEach((button) => button.addEventListener('click', async () => {
    const name = button.dataset.name;
    try {
      if (!await copyText(name)) throw new Error('copy failed');
      showToast(`已复制${name}，可以发给家人讨论。`);
    } catch (error) {
      showToast('复制失败，请长按名字手动复制。', 'info');
    }
  }));
  cards.querySelectorAll('.make-keepsake').forEach((button) => button.addEventListener('click', () => openKeepsake(button.dataset.name)));
  cards.querySelectorAll('.save').forEach((button) => button.addEventListener('click', () => {
    const name = button.dataset.name;
    saved = saved.includes(name) ? saved.filter((item) => item !== name) : [...saved, name];
    const nowSaved = saved.includes(name);
    if (nowSaved) {
      const item = lastCandidates.find((candidate) => candidate.fullName === name);
      if (item) savedDetails[name] = { pinyin: item.pinyin, meaning: item.meaning, source_status: item.source_status };
    } else delete savedDetails[name];
    renderSaved();
    if (persistSaved()) showToast(nowSaved ? `已收藏${name}` : `已取消收藏${name}`);
  }));
  return freeList.length;
}

function renderPlans(product) {
  const plans = product.plans || [];
  planGrid.innerHTML = plans.map((plan, index) => `<article class="plan ${index === 1 ? 'featured' : ''}">${index === 1 ? '<span class="plan-badge">PLANNED</span>' : ''}<h3>${escapeHTML(plan.name)}</h3><div class="plan-price">${escapeHTML(plan.price)}</div><p>${escapeHTML(plan.description)}</p><ul>${(plan.benefits || []).map((benefit) => `<li>${escapeHTML(benefit)}</li>`).join('')}</ul><button class="${index === 0 ? 'secondary' : 'primary'} plan-action" type="button" data-plan="${escapeHTML(plan.id)}">${index === 0 ? '当前免费' : '了解方案'}</button></article>`).join('');
  planGrid.querySelectorAll('.plan-action').forEach((button) => button.addEventListener('click', () => {
    const plan = plans.find((item) => item.id === button.dataset.plan);
    showToast(plan?.id === 'free' ? '免费预览已经在上方生成，可以先收藏喜欢的名字。' : (product.payment_status || '完整服务尚在规划，当前没有开通购买。'), plan?.id === 'free' ? 'success' : 'info');
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
    [/surname must contain one or two (?:Chinese )?characters/i, '姓氏需要填写 1–2 个汉字。'],
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
    [/likedChars and avoidedChars cannot overlap/i, '喜欢的字和必须避开的字不能重复，请调整后重试。'],
    [/(likedChars|avoidedChars) must contain/i, '喜欢和避开的字请填写汉字，可用空格、顿号或逗号分隔。'],
    [/request too large/i, '提交内容过大，请减少文字后重试。'],
  ];
  const match = rules.find(([pattern]) => pattern.test(text));
  return match ? match[1] : (text || '暂时无法生成方案，请稍后重试。');
}

async function requestAnalysis(data) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: controller.signal, cache: 'no-store' });
    if (response.status === 404 || response.status === 405) throw new Error('当前地址未接通起名接口，请检查网站部署后重试。');
    if (response.status === 401 || response.status === 403) throw new Error('起名接口访问受限，请检查网站代理或访问规则后重试。');
    if (response.status >= 500) throw new Error('排盘服务暂时不可用，请稍后重新生成。');
    let payload;
    try { payload = await response.json(); } catch { throw new Error('起名接口返回的内容无法识别，请检查网站部署后重试。'); }
    if (!response.ok) throw new Error(payload.error || '分析请求未通过校验');
    if (!payload.analysis?.bazi || !Array.isArray(payload.candidates)) throw new Error('服务未返回完整方案，请重试。');
    return payload;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('排盘服务响应超时，请检查网络后重新生成。');
    if (error instanceof TypeError) throw new Error('无法连接排盘服务，请检查网络后重试。');
    throw error;
  } finally { clearTimeout(timer); }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (step < 2) { if (validatePanel()) setStep(step + 1); return; }
  for (let index = 0; index < panels.length; index++) { setStep(index); if (!validatePanel()) return; }
  const data = Object.fromEntries(new FormData(form));
  data.surname = data.surname.trim();
  data.styles = [...document.querySelectorAll('input[name=style]:checked')].map((item) => item.value);
  data.variant = 0;
  lastRequest = data;
  lastAnalysis = null;
  lastCandidates = [];
  downloadReport.disabled = true;
  regenerate.disabled = true;
  cards.innerHTML = '';
  upgradePanel.hidden = true;
  summary.className = 'summary empty';
  summary.innerHTML = '<span>✦</span><p>正在整理命名方向与四柱参考。</p>';
  resultStatus.textContent = '正在生成方案…';
  const submit = form.querySelector('button[type=submit]');
  const originalLabel = submit.textContent;
  submit.disabled = true;
  submit.textContent = '正在整理…';
  showMessage('');
  try {
    const { analysis, candidates } = await requestAnalysis(data);
    renderSummary(data, analysis);
    const freeCount = renderCards(data, analysis, candidates);
    lastAnalysis = analysis;
    downloadReport.disabled = !freeCount;
    const requestedCount = Number(data.candidateCount || 3);
    resultStatus.textContent = freeCount ? `已生成 ${freeCount} 个方向，可展开卡片查看选字依据与资料状态。${freeCount < requestedCount ? `当前字数和避用字条件下，当前字库仅匹配 ${freeCount} 个。` : ''}` : '四柱已计算，当前条件下没有符合要求的候选。';
    document.querySelector('#results').scrollIntoView({ behavior: scrollBehavior() });
    showToast(freeCount ? '名字方案已生成，先收藏喜欢的方向。' : '请调整避用字或名字字数后重试。', freeCount ? 'success' : 'info');
  } catch (error) {
    lastAnalysis = null;
    lastCandidates = [];
    summary.className = 'summary empty';
    summary.innerHTML = '<span>✦</span><p>方案尚未生成，请检查填写内容后重试。</p>';
    resultStatus.textContent = '暂时无法生成方案。';
    showMessage(friendlyError(error.message || ''));
  } finally {
    submit.disabled = false;
    regenerate.disabled = false;
    submit.textContent = originalLabel;
  }
});

regenerate.addEventListener('click', async () => {
  if (lastRequest && lastAnalysis?.bazi) {
    const nextRequest = { ...lastRequest, variant: (Number(lastRequest.variant) + 1) % 100001 };
    regenerate.disabled = true;
    form.querySelector('button[type=submit]').disabled = true;
    try {
      const { analysis, candidates } = await requestAnalysis(nextRequest);
      const freeCount = renderCards(nextRequest, analysis, candidates);
      lastRequest = nextRequest;
      lastAnalysis = analysis;
      renderSummary(nextRequest, analysis);
      downloadReport.disabled = !freeCount;
      const requestedCount = Number(nextRequest.candidateCount || 3);
      resultStatus.textContent = freeCount ? `已按第 ${nextRequest.variant} 轮重新整理 ${freeCount} 个方案。${freeCount < requestedCount ? `当前字数和避用字条件下，当前字库仅匹配 ${freeCount} 个。` : ''}` : '四柱已计算，当前条件下没有符合要求的候选。';
      showToast(freeCount ? '已重新整理候选方向。' : '请调整避用字或名字字数后重试。', 'info');
    } catch (error) {
      showToast(friendlyError(error.message || ''), 'info');
    } finally {
      regenerate.disabled = false;
      form.querySelector('button[type=submit]').disabled = false;
    }
    return;
  }
  document.querySelector('#form').scrollIntoView({ behavior: scrollBehavior() });
  showToast('先完成上方信息，就能生成名字方案。', 'info');
});

function downloadReportFile() {
  if (!lastRequest || !lastCandidates.length) {
    showToast('先生成名字方案，再下载命名记录。', 'info');
    return;
  }
  const analysis = lastAnalysis;
  if (!analysis?.bazi) return;
  const chart = analysis.bazi;
  const comparison = analysis.bazi_comparison;
  const referenceBoundary = comparison?.reference?.boundary;
  const comparisonLines = !comparison ? [] : comparison.error
    ? [`预产期参考对照暂不可用：${comparison.error}；实际出生排盘不受影响。`]
    : [
      `预产期参考四柱（${comparison.reference.local_time}）：${comparison.differences.map(item => `${item.label} ${item.reference}`).join('　')}`,
      `实际出生四柱：${comparison.differences.map(item => `${item.label} ${item.actual}`).join('　')}`,
      `四柱对照：${comparison.differences.map(item => `${item.label}${item.changed ? '有变化' : '相同'}`).join('、')}`,
      ...(comparison.near_boundary ? ['节气边界提示：其中一组时间接近节气交接，年柱或月柱的对照结果可能随节气时刻核对而变化。'] : []),
      ...(referenceBoundary ? [`预产期参考边界：${referenceBoundary.warning} ${referenceBoundary.term} ${referenceBoundary.local_time}`, `交接前：${referenceBoundary.alternatives[0].year}年 ${referenceBoundary.alternatives[0].month}月；交接后：${referenceBoundary.alternatives[1].year}年 ${referenceBoundary.alternatives[1].month}月`] : []),
      '对照只比较四柱，不判断运势好坏；起卦和选字采用实际出生时间。'
    ];
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
    `喜欢的字：${lastRequest.likedChars || '未填写'}（排序偏好）`,
    `避用字：${lastRequest.avoidedChars || '未填写'}（仅作用于名）`,
    `候选数量：${lastCandidates.length}`,
    `四柱：${chart.pillars.map(item => `${item.label} ${item.ganzhi}`).join('　')}`,
    `日主：${chart.day_master.stem}（${chart.day_master.element}）`,
    `表面八字五行计数：${Object.entries(chart.element_counts).map(([element, count]) => `${element} ${count}`).join('、')}`,
    `排盘口径：${chart.conventions.join('；')}`,
    ...(chart.boundary ? [`节气边界提醒：${chart.boundary.warning} ${chart.boundary.term} ${chart.boundary.local_time}`, `交接前：${chart.boundary.alternatives[0].year}年 ${chart.boundary.alternatives[0].month}月；交接后：${chart.boundary.alternatives[1].year}年 ${chart.boundary.alternatives[1].month}月`] : []),
    ...comparisonLines,
    '',
    `说明：${analysis.method || '传统文化参考，不承诺确定性运势结果。'}`,
    '',
    '## 候选名字',
    ''
  ];
  lastCandidates.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.fullName}`);
    lines.push(`- 拼音：${item.pinyin}`);
    readingNotes(item.pronunciation).forEach(note => lines.push(`- ${note}`));
    lines.push(`- 寓意：${item.meaning}`);
    lines.push(`- 标签：${item.tags.join('、')}`);
    lines.push(`- ${item.ranking ? "偏好匹配" : "演示评分"}：${item.score}/100`);
    lines.push(`- 演示意象：${item.elementEvidence}`);
    lines.push(`- 易经象意：${item.guaEvidence}`);
    lines.push(`- 阴阳：${item.yinyangEvidence}`);
    lines.push(`- 评分构成：${item.scoreEvidence}`);
    lines.push(`- 寓意资料：${item.source_status === 'verified' ? '已记录复核' : '待核验'}；${item.source}`);
    if (item.source_reference?.url) lines.push(`- 参考来源：${item.source_reference.url}`);
    lines.push(item.ranking ? item.ranking.notice : '- 此旧版记录的评分和卦象关联为演示资料。');
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
renderSaved();
loadProduct();

const savedButton = document.querySelector('#savedButton');
const clearData = document.querySelector('#clearData');
savedButton?.addEventListener('click', () => {
  renderSaved();
  savedPanel.hidden = false;
  savedPanel.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
});
document.querySelector('#closeSaved')?.addEventListener('click', () => { savedPanel.hidden = true; });
savedList?.addEventListener('click', (event) => {
  const button = event.target.closest('.remove-saved');
  if (!button) return;
  saved = saved.filter((name) => name !== button.dataset.name);
  delete savedDetails[button.dataset.name];
  renderSaved();
  if (persistSaved()) showToast('已取消收藏。');
});
clearData?.addEventListener('click', () => {
  saved = [];
  savedDetails = Object.create(null);
  renderSaved();
  if (persistSaved()) showToast('本地收藏已清除。');
});

// The card is drawn and exported in the browser; form and birth data are never
// added to the site recommendation link.
const keepsakeName = document.querySelector('#keepsakeName');
const keepsakeWish = document.querySelector('#keepsakeWish');
const keepsakeCanvas = document.querySelector('#keepsakeCanvas');
const keepsakeMessage = document.querySelector('#keepsakeMessage');
const shareHint = document.querySelector('#shareHint');
const siteLink = document.querySelector('#siteLink');
const shareSite = document.querySelector('#shareSite');
const publicSite = window.Keepsake.siteURL(window.location.href);
const recommendationLink = window.Keepsake.recommendationURL(window.location.href);

function updateKeepsake() {
  const name = window.Keepsake.validate(keepsakeName.value, keepsakeWish.value);
  window.Keepsake.draw(keepsakeCanvas, name.name, name.wish, publicSite);
  keepsakeCanvas.setAttribute('aria-label', `名字心愿卡预览：${name.name || '尚未填写名字'}${name.wish ? `，祝愿：${name.wish}` : ''}`);
}

function openKeepsake(name) {
  keepsakeName.value = name;
  keepsakeMessage.hidden = true;
  updateKeepsake();
  document.querySelector('#keepsake').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  keepsakeName.focus({ preventScroll: true });
}

[keepsakeName, keepsakeWish].forEach((field) => field.addEventListener('input', () => {
  keepsakeMessage.hidden = true;
  updateKeepsake();
}));
updateKeepsake();
if (document.fonts?.ready) document.fonts.ready.then(updateKeepsake).catch(() => {});
siteLink.textContent = recommendationLink;
if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
  shareHint.textContent = '当前是本机测试地址，亲友无法通过此地址访问；上线后可复制正式链接。链接只含固定来源参数，不含姓名和出生信息。';
}
if (!publicSite) {
  document.querySelector('#copySiteLink').disabled = true;
  shareHint.textContent = '当前页面没有可分享的网站地址；卡片仍可在本机制作。';
}
if (publicSite && typeof navigator.share === 'function') shareSite.hidden = false;

document.querySelector('#downloadKeepsake').addEventListener('click', () => {
  const state = window.Keepsake.validate(keepsakeName.value, keepsakeWish.value);
  if (state.error) {
    keepsakeMessage.textContent = state.error;
    keepsakeMessage.hidden = false;
    (state.error.includes('祝愿') ? keepsakeWish : keepsakeName).focus();
    return;
  }
  keepsakeMessage.hidden = true;
  if (!window.Keepsake.draw(keepsakeCanvas, state.name, state.wish, publicSite) || typeof keepsakeCanvas.toBlob !== 'function') {
    showToast('当前浏览器无法导出图片，请尝试其他浏览器。', 'info');
    return;
  }
  keepsakeCanvas.toBlob((blob) => {
    if (!blob) { showToast('图片生成失败，请稍后重试。', 'info'); return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = state.name.replace(/[^\p{Script=Han}A-Za-z0-9_-]/gu, '').slice(0, 24);
    link.href = url; link.download = `序名心愿卡-${safeName || '名字'}.png`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast('心愿卡已下载，分享前请确认图片内容。');
  }, 'image/png');
});

document.querySelector('#copySiteLink').addEventListener('click', async () => {
  if (!publicSite) return;
  try {
    if (!await copyText(recommendationLink)) throw new Error('copy failed');
    showToast('网站链接已复制，可以自行发给亲友。');
  } catch (error) {
    showToast('复制失败，请手动复制下方网站地址。', 'info');
  }
});
shareSite.addEventListener('click', async () => {
  if (!publicSite || typeof navigator.share !== 'function') return;
  try {
    await navigator.share({ title: '序名 · 命名参考', text: '为家人寻找名字灵感。', url: recommendationLink });
  } catch (error) {
    if (error.name !== 'AbortError') showToast('分享未完成，可使用复制推荐链接。', 'info');
  }
});

})();
