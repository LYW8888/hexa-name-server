/* 候选名排序为演示规则；四柱由服务端历法引擎计算。 */
(function () {
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
    { given: '清晏宁', pinyin: 'QĪNG YÀN NÍNG', meaning: '清澈、安宁而坚定，温柔中有力量。', tags: ['水', '从容', '笃定'], styles: ['classical', 'nature'], genders: ['unknown', 'female'], score: 87, source: '按字面义项组合，经典出处待人工核验。' },
    { given: '明远', pinyin: 'MÍNG YUǍN', meaning: '明辨而有远志，心有光亮与方向。', tags: ['火', '明朗', '远志'], styles: ['classical', 'bright'], genders: ['unknown', 'male'], score: 88, source: '依据现代汉语常用义项组合，出处待人工核验。' },
    { given: '书宁', pinyin: 'SHŪ NÍNG', meaning: '以书明理，以宁守心，知性而安定。', tags: ['木', '知性', '安定'], styles: ['classical', 'modern'], genders: ['unknown', 'female', 'male'], score: 86, source: '依据现代汉语常用义项组合，出处待人工核验。' },
    { given: '若川', pinyin: 'RUÒ CHUĀN', meaning: '如水有度，心有远川；柔和而开阔。', tags: ['水', '自然', '开阔'], styles: ['modern', 'nature'], genders: ['unknown', 'female', 'male'], score: 87, source: '依据现代汉语常用义项组合，出处待人工核验。' },
    { given: '嘉言', pinyin: 'JIĀ YÁN', meaning: '嘉善之言，诚明有礼，温厚而端正。', tags: ['木', '端正', '明辨'], styles: ['classical', 'bright'], genders: ['unknown', 'female', 'male'], score: 86, source: '依据现代汉语常用义项组合，出处待人工核验。' },
    { given: '承安', pinyin: 'CHÉNG ĀN', meaning: '承其厚重，守一方安定，踏实而有担当。', tags: ['土', '承载', '安定'], styles: ['classical', 'modern'], genders: ['unknown', 'male'], score: 85, source: '依据现代汉语常用义项组合，出处待人工核验。' },
    { given: '云舒', pinyin: 'YÚN SHŪ', meaning: '云卷云舒，从容自在，心境开阔。', tags: ['水', '从容', '自然'], styles: ['modern', 'nature'], genders: ['unknown', 'female'], score: 84, source: '依据现代汉语常用义项组合，出处待人工核验。' },
    { given: '庭轩', pinyin: 'TÍNG XUĀN', meaning: '庭院端正，轩然开阔，稳重而有气度。', tags: ['土', '开阔', '端正'], styles: ['classical', 'bright'], genders: ['unknown', 'male'], score: 84, source: '依据现代汉语常用义项组合，出处待人工核验。' },
    { given: '简宁', pinyin: 'JIǍN NÍNG', meaning: '简而有致，宁静坚定，清醒而从容。', tags: ['火', '简静', '笃定'], styles: ['modern', 'classical'], genders: ['unknown', 'female', 'male'], score: 83, source: '依据现代汉语常用义项组合，出处待人工核验。' },
    { given: '明', pinyin: 'MÍNG', meaning: '明亮、明辨，心有清晰方向。', tags: ['火', '明朗'], styles: ['modern', 'bright'], genders: ['unknown', 'male', 'female'], score: 84, source: '依据现代汉语常用义项生成，出处待人工核验。' },
    { given: '宁', pinyin: 'NÍNG', meaning: '安宁、平静，保有内在力量。', tags: ['火', '安定'], styles: ['modern', 'classical'], genders: ['unknown', 'male', 'female'], score: 83, source: '依据现代汉语常用义项生成，出处待人工核验。' },
    { given: '远', pinyin: 'YUǍN', meaning: '远志、远见，也保留探索空间。', tags: ['土', '远志'], styles: ['modern', 'bright'], genders: ['unknown', 'male', 'female'], score: 82, source: '依据现代汉语常用义项生成，出处待人工核验。' },
    { given: '明远安', pinyin: 'MÍNG YUǍN ĀN', meaning: '明亮有远志，安定而有方向感。', tags: ['火', '远志', '安定'], styles: ['classical', 'bright'], genders: ['unknown', 'male', 'female'], score: 84, source: '依据现代汉语常用义项组合，出处待人工核验。' },
    { given: '若川宁', pinyin: 'RUÒ CHUĀN NÍNG', meaning: '如川开阔，心境宁静，柔韧而坚定。', tags: ['水', '自然', '笃定'], styles: ['classical', 'nature'], genders: ['unknown', 'female'], score: 83, source: '依据现代汉语常用义项组合，出处待人工核验。' },
    { given: '书宁安', pinyin: 'SHŪ NÍNG ĀN', meaning: '知性、宁静而安定，温和有分寸。', tags: ['木', '知性', '安定'], styles: ['classical', 'modern'], genders: ['unknown', 'female', 'male'], score: 82, source: '依据现代汉语常用义项组合，出处待人工核验。' }
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
    '清晏宁': { gua: '坎', guaMeaning: '坎为水，取清明、安宁之象', strokes: 35 },
    '明远': { gua: '离', guaMeaning: '离为火，取明亮、远见之象', strokes: 20 },
    '书宁': { gua: '巽', guaMeaning: '巽为风，取文理、渐进之象', strokes: 18 },
    '若川': { gua: '坎', guaMeaning: '坎为水，取流行、开阔之象', strokes: 11 },
    '嘉言': { gua: '震', guaMeaning: '震为雷，取发动、明辨之象', strokes: 21 },
    '承安': { gua: '坤', guaMeaning: '坤为地，取承载、安厚之象', strokes: 14 },
    '云舒': { gua: '巽', guaMeaning: '巽为风，取舒展、渐进之象', strokes: 21 },
    '庭轩': { gua: '艮', guaMeaning: '艮为山，取端正、安止之象', strokes: 20 },
    '简宁': { gua: '离', guaMeaning: '离为火，取简明、文明之象', strokes: 25 },
    '明': { gua: '离', guaMeaning: '离为火，取明亮、文明之象', strokes: 8 },
    '宁': { gua: '离', guaMeaning: '离为火，取安宁、守静之象', strokes: 14 },
    '远': { gua: '坤', guaMeaning: '坤为地，取厚重、远志之象', strokes: 17 },
    '明远安': { gua: '离', guaMeaning: '离为火，取明亮、远志、安定之象', strokes: 26 },
    '若川宁': { gua: '坎', guaMeaning: '坎为水，取流行、清宁之象', strokes: 25 },
    '书宁安': { gua: '巽', guaMeaning: '巽为风，取文理、安定、渐进之象', strokes: 24 }
  };
  profiles.forEach((profile) => Object.assign(profile, classical[profile.given] || {}));
  function countForLength(length) {
    return profiles.filter((item) => [...item.given].length === Number(length)).length;
  }
  // Selection and ordering come from the API; this only adds presentation data.
  function candidates(data, analysis, selected = []) {
    const byGiven = new Map(profiles.map((profile) => [profile.given, profile]));
    return selected.map((candidate, index) => {
      const profile = byGiven.get(candidate.given);
      if (!profile) throw new Error('候选资料版本不一致，请刷新页面后重试。');
      const polarity = profile.strokes % 2 === 0 ? '阴' : '阳';
      return { ...profile, score: candidate.score, scoreEvidence: candidate.score_evidence,
        elementEvidence: `演示字库意象分类：${profile.tags[0]}；归类尚未核验，不代表生辰五行。`,
        guaEvidence: `演示库人工关联的八卦象意：${profile.gua}卦，${profile.guaMeaning}。并非依出生信息起卦；《周易·说卦传》来源及释义待核验。`,
        yinyangEvidence: `演示笔画奇偶参考：候选名暂记 ${profile.strokes} 画，按奇偶标为${polarity}；笔画和对应规则均待核验，不能用于判断运势。`,
        fullName: candidate.name, analysis: analysis.method, rank: index + 1 };
    });
  }
  window.NameEngine = { candidates, countForLength };
}());
