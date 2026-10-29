const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8'), context);
const engine = context.window.NameEngine;

test('client displays server evidence and does not synthesize a chart', () => {
  assert.equal(engine.analyze, undefined);
  const selected = [{ given: '景和', name: '林景和', pinyin:'JǏNG HÉ', meaning:'光明和雅', tags:['光明'], source:'资料待核验', score:96, score_evidence:'未计算喜用神', gua_evidence:'并非依出生信息起卦', element_evidence:'演示', yinyang_evidence:'待核验' }];
  const candidates = engine.candidates({}, { method: '服务端排盘' }, selected);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].fullName, '林景和');
  assert.equal(candidates[0].score, 96);
  assert.match(candidates[0].guaEvidence, /并非依出生信息起卦/);
  assert.match(candidates[0].scoreEvidence, /未计算喜用神/);
});

test('client preserves server selection and rejects incomplete metadata', () => {
  assert.equal(engine.candidates({}, {}, []).length, 0);
  assert.throws(() => engine.candidates({}, {}, [{ given: '不存在' }]), /候选资料不完整/);
  engine.setCounts({'1': 15, '2': 15, '3': 5});
  assert.equal(engine.countForLength(1), 15);
});
