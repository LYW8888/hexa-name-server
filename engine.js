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
  function digits(value) { return [...(value || '')].filter((x) => /\d/.test(x)).reduce((a, x) => a + Number(x), 0); }
  function textScore(value) { return [...(value || '')].reduce((sum, char) => sum + char.codePointAt(0), 0); }
  function birthAnalysis(date, time, place, parents, mode, gender) {
    const effectiveTime = time || (mode === 'due_date' ? '12:00' : '');
    const sum = digits(`${date || ''}${effectiveTime}`) + textScore(place) + textScore(parents);
    const primary = elements[sum % elements.length];
    const support = elements[(sum + 2) % elements.length];
    const family = parents ? '已纳入父母姓氏线索' : '未填写父母姓氏';
    const scenario = mode === 'due_date' ? '预产期参考' : '已出生准确时间';
    const genderLabel = gender === 'male' ? '男' : gender === 'female' ? '女' : '未知';
    return { primary, support, family, scenario, gender: genderLabel, time: effectiveTime, method: `演示规则：${scenario}使用 ${date || '未填写日期'} ${effectiveTime || '未填写时间'}，并结合出生地与父母姓氏字符线索映射五行意象；${family}；性别偏好为${genderLabel}。正式版本应替换为经核验的历法排盘服务。` };
  }
  function candidates(data, analysis) {
    const desiredLength = Number(data.length || 2);
    const selectedStyles = data.styles || [];
    const gender = data.gender || 'unknown';
    const exact = profiles.filter((item) => [...item.given].length === desiredLength);
    const pool = exact.length ? exact : profiles;
    return pool.map((profile, index) => {
      const elementBoost = profile.tags.includes(analysis.primary) ? 2 : 0;
      const styleBoost = selectedStyles.some((style) => profile.styles.includes(style)) ? 2 : 0;
      const familyBoost = data.parents && profile.tags.includes(analysis.support) ? 1 : 0;
      const genderBoost = gender === 'unknown' || profile.genders.includes(gender) ? 2 : 0;
      return { ...profile, score: Math.min(profile.score + elementBoost + styleBoost + familyBoost + genderBoost, 99), rank: index + 1, fullName: `${data.surname || '林'}${profile.given}`, analysis: analysis.method };
    }).sort((a, b) => b.score - a.score).slice(0, 6);
  }
  window.NameEngine = { analyze: (data) => birthAnalysis(data.date, data.time, data.place, data.parents, data.mode, data.gender), candidates };
}());
