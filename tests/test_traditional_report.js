const test = require('node:test');
const assert = require('node:assert/strict');

test('legacy reports do not invent solar or Mingli results', async () => {
  const {calculationLines}=await import('../frontend/src/traditional-report.js');
  assert.deepEqual(calculationLines({bazi:{}}),[]);
});
test('solar report preserves civil time, components, comparison and boundary', async () => {
  const {calculationLines}=await import('../frontend/src/traditional-report.js');
  const chart={civil_pillars:[{label:'日柱',ganzhi:'甲辰'}],time_correction:{applied:true,civil_time:'2024-02-10 23:05 +0800',clock_time:'2024-02-10 19:54',longitude:75.99,longitude_minutes:-176.04,equation_of_time_minutes:-14.23,total_minutes:-190.27,formula:'测试算式',utc_offset_minutes:480,dst_minutes:0,pillar_changes:['日柱'],notice:'测试坐标提示',near_hour_boundary:true}};
  const text=calculationLines({bazi:chart}).join('\n');
  for (const value of ['原始时间 2024-02-10 23:05','真太阳钟：2024-02-10 19:54','-176.04','-14.23','民用四柱：日柱 甲辰','时辰边界']) assert.ok(text.includes(value));
});
test('review-required Mingli report keeps proposed directions separate from applied choice', async () => {
  const {calculationLines}=await import('../frontend/src/traditional-report.js');
  const m={version:'sample-v1',method:'月令扶抑',weight_origin:'测试参数',pattern:{label:'测试格',month_branch:'寅',selected_stem:'甲',selected_ten_god:'比肩',basis:'测试'},strength:{label:'偏强',support_weight:8,total_weight:10,support_percent:80,thresholds:{weak_below:.4,strong_above:.6},element_weights:{木:8,水:2},contributions:[],sensitivity:[]},favorable:{status:'review_required',label:'喜用参考需复核',primary:null,secondary:[],proposed:{primary:'火',secondary:['土']},reason:'测试扶抑',review_reasons:['存在合化待复核'],notice:'匹配值不代表运势'},parameters:{month_branch_weight:3},interactions:[],notes:[],notice:'古籍版本仍待核验'};
  const text=calculationLines({mingli:m}).join('\n');
  for(const value of ['喜用参考需复核','待复核方向：用火、喜土；未参与喜用排序','存在合化待复核','古籍版本仍待核验','不代表运势']) assert.ok(text.includes(value));
});

test('original-name report retains observations, directions and catalog source without inventing meaning',async()=>{
 const {nameReviewLines}=await import('../frontend/src/name-review-report.js');
 assert.deepEqual(nameReviewLines(null),[]);
 const value={full_name:'李龘',findings:[{title:'字形五行依据',detail:'本规则未归类'}],directions:['保留姓氏'],notice:'出生四柱不随改名改变'};
 const text=nameReviewLines(value).join('\n');assert.ok(text.includes('现用姓名：李龘'));assert.ok(text.includes('本规则未归类'));assert.ok(!text.includes('已收录寓意'));
});
