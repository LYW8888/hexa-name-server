const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = { window: {}, URL };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'keepsake.js'), 'utf8'), context);
const service = context.window.Keepsake;

test('recommendation link never includes form data, path, query, fragment or credentials', () => {
  assert.equal(service.siteURL('https://user:secret@example.com:8443/report?birthDate=2024-01-01&name=林#private'), 'https://example.com:8443/');
  assert.equal(service.siteURL('http://localhost:4173/?place=杭州'), 'http://localhost:4173/');
  assert.equal(service.recommendationURL('https://example.com/?name=林&birthDate=2024-01-01#private'), 'https://example.com/?utm_source=share&utm_medium=referral');
  for (const input of ['file:///secret', 'javascript:alert(1)', 'invalid']) assert.equal(service.siteURL(input), '');
});

test('card input is optional for wishes and bounded by Unicode characters', () => {
  assert.match(service.validate('', '').error, /填写/);
  assert.equal(service.validate('  欧阳知衡 ', '').name, '欧阳知衡');
  assert.equal(service.validate('𠮷'.repeat(12), '').error, '');
  assert.match(service.validate('𠮷'.repeat(13), '').error, /12/);
  assert.match(service.validate('林知衡', '愿'.repeat(41)).error, /40/);
  assert.equal(service.validate('林知衡', ' 愿\n 你安好 ').wish, '愿 你安好');
});
