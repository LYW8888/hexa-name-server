/* Candidate selection and evidence are supplied by the server catalog. */
(function () {
  let counts = {};
  function setCounts(value) {
    counts = value && typeof value === 'object' ? value : {};
  }
  function countForLength(length) {
    return Number(counts[String(length)]) || 0;
  }
  function candidates(data, analysis, selected = []) {
    return selected.map((candidate, index) => {
      if (!candidate.given || !candidate.name || !candidate.pinyin || !Array.isArray(candidate.tags) ||
          !candidate.meaning || !candidate.source || !candidate.score_evidence || !candidate.gua_evidence ||
          !candidate.element_evidence || !candidate.yinyang_evidence) {
        throw new Error('候选资料不完整，请联系维护人员核对字库。');
      }
      return { ...candidate, fullName: candidate.name, scoreEvidence: candidate.score_evidence,
        elementEvidence: candidate.element_evidence, guaEvidence: candidate.gua_evidence,
        yinyangEvidence: candidate.yinyang_evidence, analysis: analysis.method, rank: index + 1 };
    });
  }
  window.NameEngine = { candidates, countForLength, setCounts };
}());
