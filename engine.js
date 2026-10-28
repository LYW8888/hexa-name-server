/* 可替换的命名规则层。当前规则是透明的演示实现，不等同于完整八字排盘。 */
(function () {
  const elements = ['木', '火', '土', '金', '水'];
  const profiles = [
    { given: '知衡', pinyin: 'ZHĪ HÉNG', meaning: '知其所来，守心而衡；清醒而有分寸。', tags: ['木', '明辨', '端正'], styles: ['classical', 'bright'], genders: ['unknown', 'male'], score: 94, source: '“知”与“衡”取知行与持守之意，出处待人工核验。' },
    { given: '景和', pinyin: 'JǐNG HÉ', meaning: '景是光明与敬意，和是从容与相处。', tags: ['火', '光明', '和雅'], styles: ['classical', 'bright'], genders: ['unknown', 'male', 'female'], score: 92, source: '“景”和“和”为常用汉字义项，经典出处待人工核验。' },
    { given: '予安', pinyin: 'YǓ ĀN', meaning: '予人以善意，也为自己留一方安定。', tags: ['土', '安定', '温润'], styles: ['classical', 'modern'], genders: ['unknown', 'female'], score: 90, source: '依据现代汉语常用义项生成，未宣称特定经典出处。' },
    { given: '清晏', pinyin: 'QĪNG YÀN', meaning: '清澈而坚定，晏然自得，心有晴明。', tags: ['水', '清澈', '从容'], styles: ['classical', 'nature'], genders: ['unknown', 'female'], score: 89, source: '“晏”取安宁、和柔之义，具体出处需由资料库确认。' },
    { given: '言川', pinyin: 'YÁN CHUĀN', meaning: '言有所守，心有远川；诚实而开阔。', tags: ['水', '开阔', '诚明'], styles: ['modern', 'nature'], genders: ['unknown', 'male'], score: 88, source: '结合字面意象和读音生成，未使用未经核验的古籍引文。' },
    { given: '昭宁', pinyin: 'ZHĀO NÍNG', meaning: '昭示光亮，宁静笃定，温柔而有力量。', tags: ['火', '光亮', '笃定'], styles: ['classical', 'bright'], genders: ['unknown', 'female'], score: 87, source: '“昭”“宁”取明亮、安宁义项，出处待人工核验。' },
    { given: '安', pinyin: 'ĀN', meaning: '安定、从容，也保留给未来的空间。', tags: ['土', '安定'], styles: ['modern', 'classical'], genders: ['unknown', 'female', 'male'], score: 86, source: '依据现代汉语常用义项生成，未宣称特定经典出处。' },
    { given: '澄', pinyin: 'CHÉNG', meaning: '澄明而不喧，保有清醒和宁静。', tags: ['水', '澄明'], styles: ['modern', 'nature'], genders: ['unknown', 'female', 'male'], score: 85, source: '依据字面意象生成，出处待人工核验。' },
    { given: '知行', pinyin: 'ZHĪ XÍNG', meaning: '知与行相互照见，把理解带入生活。', tags: ['木', '实践', '明辨'], styles: ['classical', 'bright'], genders: ['unknown', 'male'], score: 91, source: '“知行”是常见思想表达，具体出处需由资料库确认。' },
    { given: '景和安', pinyin: 'JǐNG HÉ ĀN', meaning: '有光明、有和意，也有安定的落点。', tags: ['火', '和雅', '安定'], styles: ['classical', 'bright'], genders: ['unknown', 'female', 'male'], score: 88, source: '按字面义项组合，经典出处待人工核验。' },
    { given: '清晏宁', pinyin: 'QĪNG YÀN NÍNG', meaning: '清澈、安宁而坚定，温柔中有力量。', tags: ['水', '从容', '笃定'], styles: ['classical', 'nature'], genders: ['unknown', 'female'], score: 87, source: '按字面义项组合，经典出处待人工核验。' }
  ];
  const classical = {
    '知衡': { gua: '巽', guaMeaning: '巽为风，取渐入、通达之象', strokes: 24 },
    '景和': { gua: '离', guaMeaning: '离为火，取明亮、依附之象', strokes: 20 },
    '予安': { gua: '坤', guaMeaning: '坤为地，取厚重、承载之象', strokes: 10 },
    '清晏': { gua: '坎', guaMeaning: '坎为水，取流行、守正之象', strokes: 21 },
    '言川': { gua: '坎', guaMeaning: '坎为水，取流动、深思之象', strokes: 10 },
    '昭宁': { gua: '离', guaMeaning: '离为火，取明亮、文明之象', strokes: 23 },
    '安': { gua: '坤', guaMeaning: '坤为地，取安厚、承载之象', strokes: 6 },
    '澄': { gua: '坎', guaMeaning: '坎为水，取澄明、流行之象', strokes: 16 },
    '知行': { gua: '震', guaMeaning: '震为雷，取发动、实践之象', strokes: 14 },
    '景和安': { gua: '离', guaMeaning: '离为火，取光明、和合之象', strokes: 26 },
    '清晏宁': { gua: '坎', guaMeaning: '坎为水，取清明、安宁之象', strokes: 35 }
  };
  profiles.forEach((profile) => Object.assign(profile, classical[profile.given] || {}));
  function digits(value) { return [...(value || '')].filter((x) => /\d/.test(x)).reduce((a, x) => a + Number(x), 0); }
  function textScore(value) { return [...(value || '')].reduce((sum, char) => sum + char.codePointAt(0), 0); }
  function birthAnalysis(data) {
    const mode = data.mode || 'due_date';
    const dueDate = data.dueDate || '';
    const dueTime = data.dueTime || '12:00';
    const birthDate = data.birthDate || '';
    const birthTime = data.birthTime || '';
    const actualComplete = Boolean(birthDate && birthTime);
    const basisDate = actualComplete ? birthDate : dueDate;
    const basisTime = actualComplete ? birthTime : dueTime;
    const sum = digits(`${basisDate}${basisTime}`) + textScore(data.place) + textScore(data.parents);
    const primary = elements[sum % elements.length];
    const support = elements[(sum + 2) % elements.length];
    const family = data.parents ? '已纳入父母姓氏线索' : '未填写父母姓氏';
    const scenario = actualComplete ? (mode === 'born' ? '已出生准确时间' : '预产期参考 + 已出生信息') : '预产期参考';
    const genderLabel = data.gender === 'male' ? '男' : data.gender === 'female' ? '女' : '未知';
    return { primary, support, family, scenario, gender: genderLabel, time: basisTime, due_date: dueDate, due_time: dueDate ? dueTime : '', birth_date: birthDate, birth_time: birthTime, method: `演示规则：以${actualComplete ? '实际出生日期和准确时间' : '预产期和参考时间'}作为主要计算输入；${dueDate ? `预产期为 ${dueDate} ${dueTime}` : '未填写预产期'}；${birthDate ? `出生信息为 ${birthDate} ${birthTime}` : '尚未填写实际出生信息'}；${family}；性别偏好为${genderLabel}。正式版本应替换为经核验的历法服务。` };
  }
  function countForLength(length) {
    return profiles.filter((item) => [...item.given].length === Number(length)).length;
  }
  function candidates(data, analysis) {
    const desiredLength = Number(data.length || 2);
    const requestedCount = Number.parseInt(data.candidateCount ?? data.count ?? 3, 10);
    const candidateCount = Number.isInteger(requestedCount) && requestedCount >= 1 && requestedCount <= 11 ? requestedCount : 3;
    const selectedStyles = data.styles || [];
    const gender = data.gender || 'unknown';
    const meaningText = String(data.meaning || '');
    const charsText = String(data.chars || '');
    const avoidMatch = charsText.match(/(?:避开|避開|不要|不取)[：:\s‘“"']*([^，,；;\s]+)/);
    const avoidText = avoidMatch ? avoidMatch[1] : '';
    const exact = profiles.filter((item) => [...item.given].length === desiredLength);
    const pool = exact.length ? exact : profiles;
    return pool.map((profile) => {
      const elementBoost = profile.tags.includes(analysis.primary) ? 2 : 0;
      const styleBoost = selectedStyles.some((style) => profile.styles.includes(style)) ? 2 : 0;
      const familyBoost = data.parents && profile.tags.includes(analysis.support) ? 1 : 0;
      const genderBoost = gender === 'unknown' || profile.genders.includes(gender) ? 2 : 0;
      const preferenceBoost = [...profile.given].some((char) => meaningText.includes(char) || charsText.includes(`喜欢${char}`) || charsText.includes(`喜歡${char}`)) ? 2 : 0;
      const avoidPenalty = [...profile.given].some((char) => avoidText.includes(char)) ? -8 : 0;
      const polarity = profile.strokes % 2 === 0 ? '阴' : '阳';
      const element = profile.tags[0];
      const scoreEvidence = `评分构成：基础 ${profile.score}；${elementBoost ? '五行匹配 +2；' : '五行匹配 +0；'}${styleBoost ? '风格偏好 +2；' : '风格偏好 +0；'}${familyBoost ? '家庭线索 +1；' : '家庭线索 +0；'}${genderBoost ? '性别倾向 +2；' : '性别倾向 +0；'}${preferenceBoost ? '文字偏好 +2；' : '文字偏好 +0；'}${avoidPenalty ? '避用字 -8。' : '避用字 0。'}`;
      return { ...profile, scoreEvidence, elementEvidence: `五行参考：${element}（候选字库归类，正式版本需按统一字典复核）`, guaEvidence: `《周易·说卦传》八卦象意参考：${profile.gua}卦，${profile.guaMeaning}。此处为象意参考，不是卦辞断语。`, yinyangEvidence: `阴阳参考：候选名笔画合计 ${profile.strokes} 画，按传统奇偶数理标为${polarity}；笔画版本需在正式字库中确认。`, score: Math.max(0, Math.min(profile.score + elementBoost + styleBoost + familyBoost + genderBoost + preferenceBoost + avoidPenalty, 99)), fullName: `${data.surname || '林'}${profile.given}`, analysis: analysis.method };
    }).sort((a, b) => b.score - a.score).slice(0, candidateCount).map((item, index) => ({ ...item, rank: index + 1 }));
  }
  window.NameEngine = { analyze: birthAnalysis, candidates, countForLength };
}());
