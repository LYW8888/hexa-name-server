import {getClockInZone} from './utils.js';

export function identityGuide(data = {}) {
  const surname = String(data.surname || '').trim();
  const rename = data.purpose === 'rename';
  const validSurname = /^[\p{Script=Han}〇]{1,2}$/u.test(surname);
  const name = String(data.currentName || '').trim();
  const ready = validSurname && (!rename || (name.startsWith(surname) && name.length > surname.length && /^[\p{Script=Han}〇]+$/u.test(name)));
  return {
    ready,
    title: rename ? `为${name || '现用姓名'}寻找改名方向` : `为${surname || '宝宝'}${surname ? '姓宝宝' : ''}准备${data.mode === 'born' ? '已出生' : '预产期'}起名`,
    note: rename ? '先了解现名，再比较保留与调整的可能。' : data.mode === 'born' ? '下一步填写真实出生时刻，用于本次选字。' : '下一步只需填写预产期，出生后可更新实际时刻。',
  };
}

export function birthGuide(data = {}, clock = getClockInZone(data.zone || 'Asia/Shanghai')) {
  const born = data.mode === 'born';
  const date = born ? data.birthDate : data.dueDate;
  const time = born ? data.birthTime : data.dueTime || '12:00';
  const parsedDate = new Date(`${date}T00:00:00Z`);
  const validDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '1900-01-01' && date <= '2100-12-31' && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date;
  const validTime = typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const minutes = validTime ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : 0;
  const future = born && validDate && (date > clock.date || (date === clock.date && validTime && minutes > clock.minutes));
  const solar = data.timeBasis === 'apparent_solar';
  const longitude = data.longitude;
  const validLongitude = !solar || (longitude !== '' && longitude != null && Number.isFinite(Number(longitude)) && Math.abs(Number(longitude)) <= 180);
  const ready = !!(validDate && validTime && !future && validLongitude);
  const zone = {'Asia/Shanghai':'北京时间','Asia/Taipei':'台北时间','Asia/Hong_Kong':'香港时间'}[data.zone || 'Asia/Shanghai'] || data.zone;
  return {
    ready,
    title: ready ? '出生依据已准备好' : '补全出生依据，就能开始选名',
    summary: `${born ? '实际出生' : '预产期参考'} ${date || '待填日期'}${time ? ` ${time}` : ' · 待填准确时间'} · ${zone} · ${solar ? '真太阳时' : '民用时间'}`,
    note: future ? '实际出生日期与时间不能晚于当前时刻。' : !validLongitude ? '真太阳时需要有效经度，可选择城市自动带入。' : born ? '将结合真实出生信息整理选字方向，再逐个比较名字。' : '预产期用于提前选名；宝宝出生后可按实际时刻重新分析。',
  };
}
