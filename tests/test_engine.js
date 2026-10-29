const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8'), context);
const engine = context.window.NameEngine;

test('client candidate engine does not synthesize a four-pillar chart', () => {
  assert.equal(engine.analyze, undefined);
  const input = { surname: '林', length: 2, candidateCount: 3, gender: 'unknown', styles: ['classical'] };
  const selected = [{ given: '景和', name: '林景和', score: 96, score_evidence: '服务端评分，未计算喜用神' }];
  const candidates = engine.candidates(input, { method: '服务端排盘' }, selected);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].fullName, '林景和');
  assert.equal(candidates[0].score, 96);
  assert.match(candidates[0].guaEvidence, /并非依出生信息起卦/);
  assert.match(candidates[0].scoreEvidence, /未计算喜用神/);
});

test('client preserves server selection and rejects unmatched metadata', () => {
  assert.equal(engine.candidates({}, {}, []).length, 0);
  assert.throws(() => engine.candidates({}, {}, [{ given: '不存在' }]), /版本不一致/);
});
