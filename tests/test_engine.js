const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8'), context);
const engine = context.window.NameEngine;

test('timezone labels do not alter demo direction or candidate scores', () => {
  const base = { mode: 'due_date', surname: '林', dueDate: '2099-01-01', dueTime: '12:00', place: '杭州', length: 2, candidateCount: 3, gender: 'unknown' };
  const results = ['Asia/Shanghai', 'Asia/Taipei', 'Asia/Hong_Kong'].map(zone => {
    const input = { ...base, zone };
    const analysis = engine.analyze(input);
    const candidates = engine.candidates(input, analysis);
    return { primary: analysis.primary, support: analysis.support, names: candidates.map(item => [item.fullName, item.score]), method: analysis.method, candidates };
  });
  assert.equal(JSON.stringify(results[0].names), JSON.stringify(results[1].names));
  assert.equal(JSON.stringify(results[0].names), JSON.stringify(results[2].names));
  assert.equal(results[0].primary, results[1].primary);
  assert.equal(results[0].support, results[2].support);
  assert.match(results[0].method, /并非四柱排盘或五行分析/);
  assert.match(results[0].candidates[0].guaEvidence, /并非依出生信息起卦/);
});
