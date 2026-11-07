import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {basic,birth,preferences,location,submitNaming as submit} from "./wizard.js";

async function selectScenario(page, scenario) {
  await basic(page);
  await page.locator(`[name=scenario][value=${scenario}]`).locator("..").click();
}
async function openSettings(page) {
  await preferences(page);
  const details = page.locator(".naming-preferences");
  if (!(await details.evaluate(el => el.open))) await details.locator(":scope > summary").click();
}
async function openDetail(page, selector) {
  if(selector === ".time-settings") { await location(page); return; } else await openSettings(page);
  const details = page.locator(selector);
  if (!(await details.evaluate(el => el.open))) await details.locator(":scope > summary").click();
}
async function fillInfo(page, { scenario = "due_date", surname = "林", currentName = "林明哲", date = "2099-12-23", time = "12:00", place = "杭州", complete = true } = {}) {
  await selectScenario(page, scenario);
  if (scenario === "rename") await page.locator("[name=currentName]").fill(currentName);
  else await page.locator("[name=surname]").fill(surname);
  await birth(page);
  await page.locator(`[name=${scenario === "due_date" ? "dueDate" : "birthDate"}]`).fill(date);
  if (scenario !== "due_date") await page.locator("[name=birthTime]").fill(time);
  await location(page); await page.locator("[name=place]").fill(place);
  if(complete) await preferences(page);
}
async function generate(page, options = {}) {
  await fillInfo(page, options);
  await submit(page);
  await expect(page.locator("#cards .card")).toHaveCount(10);
}

for (const width of [1280,390]) test(`起名旅程从即时反馈引导到读名收藏与比较 ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:950});await page.goto('/');
  let claims=0;page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/beta-reports')claims++;});
  await page.locator('[name=surname]').fill('陈');
  await expect(page.locator('.identity-result')).toContainText('为陈姓宝宝准备预产期起名');
  await expect(page.locator('.journey-welcome')).toContainText('为陈姓宝宝准备预产期起名');
  await page.getByRole('button',{name:'下一步：出生信息',exact:true}).click();
  await expect(page.getByRole('region',{name:'本次出生依据'})).toHaveCount(0);
  await page.locator('[name=dueDate]').fill('2099-05-18');
  const birthPreview=page.getByRole('region',{name:'本次出生依据'});
  await expect(birthPreview).toContainText('预产期参考 2099-05-18 12:00');
  await expect(birthPreview).toContainText('出生后可按实际时刻重新分析');
  const response=page.waitForResponse('**/api/analyze');await page.getByRole('button',{name:'生成起名方向与提案',exact:true}).click();
  const payload=await(await response).json();await expect(page.locator('#cards .card')).toHaveCount(10);
  const direction=page.getByRole('region',{name:'本次起名方向'});
  await expect(direction).toContainText(payload.candidates[0].details.fit.label);
  await expect(direction).toContainText('预产期参考');
  const guide=page.locator('.selection-guide');
  await guide.getByRole('button',{name:'从第一个名字开始了解',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.locator('.name-detail-heading')).toContainText(payload.candidates[0].name);
  await dialog.getByRole('button',{name:'收藏这个名字',exact:true}).click();
  await expect(dialog.locator('.detail-next-hint')).toContainText('已留作备选');
  await dialog.getByRole('button',{name:'继续看下一个名字',exact:true}).click();
  await expect(dialog.locator('.name-detail-heading')).toContainText(payload.candidates[1].name);
  await expect(dialog.locator('.name-detail-heading').getByRole('heading')).toBeFocused();
  await expect(dialog.locator('.name-detail-heading')).toBeInViewport();
  await dialog.getByRole('button',{name:'收藏这个名字',exact:true}).click();
  await page.keyboard.press('Escape');
  await expect(guide).toContainText('已有2个名字可以比较');
  await guide.getByRole('button',{name:'比较备选名字',exact:true}).click();
  const panel=page.getByRole('region',{name:'名字比较',exact:true});await expect(panel).toBeFocused();await expect(panel).toBeInViewport();
  await expect(panel.locator('article')).toHaveCount(2);
  await expect(panel).toContainText(payload.candidates[0].name);await expect(panel).toContainText('出处：');
  expect(claims).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('改名先展示可核对的现名简报，修改事实必须重新分析',async({page})=>{
  await page.setViewportSize({width:390,height:950});await page.goto('/');
  await fillInfo(page,{scenario:'rename',currentName:'欧阳明明',date:'1998-08-13',time:'13:48',place:'',complete:false});
  const response=page.waitForResponse('**/api/name-review');await page.getByRole('button',{name:'分析现用姓名',exact:true}).click();
  const payload=await(await response).json();
  await expect(page.locator('.current-name-preview')).toContainText('名内重复：明');
  for(const row of payload.analysis.review_preview.findings)await expect(page.locator('.current-name-preview')).toContainText(row.detail);
  expect(payload.analysis).not.toHaveProperty('name_review');expect(payload.analysis).not.toHaveProperty('bazi');
  await expect(page.locator('#cards .card')).toHaveCount(0);
  await page.locator('[name=birthTime]').fill('13:49');await expect(page.locator('.current-name-preview')).toHaveCount(0);
  await page.getByRole('button',{name:'重新分析现用姓名',exact:true}).click();await expect(page.locator('.current-name-preview')).toBeVisible();
  await page.getByRole('button',{name:'查看改名提案',exact:true}).click();await expect(page.locator('#cards .card')).toHaveCount(10);
  await expect(page.getByRole('region',{name:'本次起名方向'})).toContainText('你的改名方向');
  await expect(page.getByRole('region',{name:'本次起名方向'})).toContainText('已先分析现名「欧阳明明」');
});

test('跨组收藏延续本次选名引导，切换场景不串用备选进度',async({page})=>{
  await page.goto('/');await generate(page);
  const first=await page.locator('#cards h3').first().textContent();await page.locator('#cards .save').first().click();
  const response=page.waitForResponse('**/api/analyze');await page.getByRole('button',{name:'换一组名字',exact:true}).click();await response;
  await expect(page.locator('#cards h3').first()).not.toHaveText(first);
  const second=await page.locator('#cards h3').first().textContent();await page.locator('#cards .save').first().click();
  const guide=page.locator('.selection-guide');await expect(guide).toContainText('已有2个名字可以比较');
  await guide.getByRole('button',{name:'比较备选名字',exact:true}).click();
  const panel=page.getByRole('region',{name:'名字比较',exact:true});await expect(panel).toContainText(first);await expect(panel).toContainText(second);
  await selectScenario(page,'born');await expect(page.locator('.selection-guide')).toHaveCount(0);await expect(page.locator('.naming-direction')).toHaveCount(0);
  await expect(page.locator('#cards .card')).toHaveCount(0);
});

test('未收藏也能比较并复制名单，不要求领取报告或提交反馈',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedNames=text;}}});});
  await page.goto('/');await generate(page);
  const names=(await page.locator('#cards h3').allTextContents()).slice(0,2);
  for(let index=0;index<2;index++)await page.locator('#cards .compare-name').nth(index).click();
  await page.locator('.selection-guide').getByRole('button',{name:'比较备选名字',exact:true}).click();
  await page.locator('.selection-guide').getByRole('button',{name:'复制备选给家人',exact:true}).click();
  expect(await page.evaluate(()=>window.copiedNames)).toBe(names.join('、'));
  await expect(page.locator('#savedCount')).toHaveText('0');await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('出生信息变动后旧方向保留标识，下一步引导等待应用修改',async({page})=>{
  await page.goto('/');await generate(page);await birth(page);await page.locator('[name=dueDate]').fill('2099-12-24');
  await expect(page.getByRole('region',{name:'尚未应用的修改'})).toBeVisible();
  await expect(page.locator('.selection-guide')).toHaveCount(0);
  await expect(page.locator('.naming-direction')).toContainText('2099-12-23');
  const response=page.waitForResponse('**/api/analyze');await page.getByRole('button',{name:'应用修改并生成',exact:true}).click();await response;
  await expect(page.locator('.naming-direction')).toContainText('2099-12-24');await expect(page.locator('.selection-guide')).toBeVisible();
});

for (const width of [1280, 390]) {
  test(`三种场景切换且保留各自资料 ${width}px`, async ({page})=>{
    await page.setViewportSize({width,height:950});await page.goto('/');
    await selectScenario(page,'due_date');
    await basic(page); await page.locator('[name=surname]').fill('林');await birth(page); await page.locator('[name=dueDate]').fill('2099-12-23');
    await selectScenario(page,'born');
    await expect(page.locator('[name=dueDate]')).toHaveCount(0);
    await birth(page); await page.locator('[name=birthDate]').fill('2024-01-05');await birth(page); await page.locator('[name=birthTime]').fill('13:48');
    await selectScenario(page,'rename');
    await expect(page.locator('[name=currentName]')).toBeVisible();await expect(page.locator('[name=birthDate]')).toHaveValue('');
    await basic(page); await page.locator('[name=currentName]').fill('欧阳明哲');
    await selectScenario(page,'due_date');
    await expect(page.locator('[name=scenario][value=due_date]')).toBeChecked();
    await expect(page.locator('[name=currentName]')).toHaveCount(0);await expect(page.locator('[name=dueDate]')).toHaveValue('2099-12-23');
    const request=page.waitForRequest('**/api/analyze');await submit(page);
    expect((await request).postDataJSON()).toMatchObject({surname:'林',purpose:'newborn',mode:'due_date'});
    await expect(page.locator('#cards .card')).toHaveCount(10);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  });
  test(`首次预产期按两步引导、默认十个备选 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/");
    await expect(page.locator(".naming-preferences")).toBeHidden();
    await expect(page.locator(".birth-info")).toBeHidden();
    await expect(page.locator("[name=length]")).toBeHidden();
    await expect(page.locator("[name=dueTime]")).toBeHidden();
    let calls = 0;
    page.on("request", request => { if (request.url().endsWith("/api/analyze")) calls++; });
    await fillInfo(page);
    const request = page.waitForRequest("**/api/analyze");
    await page.getByRole("button", { name: "生成起名方向与提案", exact: true }).click();
    const input = (await request).postDataJSON();
    await expect(page.locator("#cards .card")).toHaveCount(10);
    expect(calls).toBe(1);
    expect(input).toMatchObject({ purpose: "newborn", mode: "due_date", dueTime: "12:00", length: "2", candidateCount: "10", gender: "unknown", algorithm: "literary_v3" });
    expect(input).not.toHaveProperty("birthDate");
    expect(input).not.toHaveProperty("scenario");
    await expect(page.locator("#summary")).toContainText("新生儿起名 · 预产期");
    await expect(page.locator(".naming-steps [aria-current=step]")).toContainText("出生信息");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  });
  test(`已出生起名只返回免费名字提案 ${width}px`, async ({page})=>{
    await page.setViewportSize({width,height:950});await page.goto('/');
    const pending=page.waitForResponse('**/api/analyze');await generate(page,{scenario:'born',date:'2024-02-04',time:'16:27'});
    const data=await (await pending).json();expect(data.analysis).toMatchObject({mode:'born',access:'proposal_only'});expect(data.analysis).not.toHaveProperty('bazi');
    await expect(page.locator('[name=dueDate]')).toHaveCount(0);await expect(page.locator('#summary')).toContainText('新生儿起名 · 已出生');
    await expect(page.locator('#downloadReport')).toHaveCount(0);
  });
  test(`改名自动识别复姓、先报告再一次推荐 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 }); await page.goto("/");
    const calls = [];
    page.on("request", request => { if (/\/api\/(analyze|name-review)$/.test(request.url())) calls.push(new URL(request.url()).pathname); });
    await fillInfo(page, { scenario: "rename", currentName: "欧阳明哲", date: "1998-08-13", time: "13:48" });
    await expect(page.locator(".surname-detection")).toContainText("欧阳");
    await expect(page.locator("[name=surname]")).toBeHidden();
    await page.getByRole("button", { name: "分析现用姓名", exact: true }).click();
    await expect(page.locator("#formNameReview")).toBeVisible();
    await expect(page.locator("#cards .card")).toHaveCount(0);
    expect(calls).toEqual(["/api/name-review"]);
    await expect(page.locator("#currentReviewTitle")).toBeFocused();
    await expect(page.getByRole("button", { name: "查看改名提案", exact: true })).toBeInViewport();
    await page.getByRole("button", { name: "查看改名提案", exact: true }).click();
    await expect(page.locator("#cards .card")).toHaveCount(10);
    expect(calls).toEqual(["/api/name-review", "/api/analyze"]);
    await expect(page.locator("#summary")).toContainText("改名方案");
    await expect(page.locator("#summary")).not.toContainText("新生儿");
    expect(await page.locator("#cards h3").allTextContents()).not.toContain("欧阳明哲");
    await expect(page.locator("#formNameReview")).toContainText("完整现名分析");
    await expect(page.locator("#downloadReport")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  });
  test(`免费接口和页面均不包含完整报告 ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:950});await page.goto('/');const pending=page.waitForResponse('**/api/analyze');await generate(page);
    const value=await(await pending).json();expect(value.analysis.access).toBe('proposal_only');
    for(const field of ['bazi','mingli','gua','source_audit','name_review','naming_reference']) expect(value.analysis).not.toHaveProperty(field);
    for(const item of value.candidates)expect(Object.keys(item).sort()).toEqual(['details','given','meaning','name','pinyin']);
    await expect(page.locator('#cards details')).toHaveCount(0);await expect(page.locator('#downloadReport')).toHaveCount(0);
    await expect(page.locator('#reportRequest')).toContainText('LCEX511');await expect(page.locator('#reportRequest')).toContainText('19437771');
    expect((await page.request.get('/api/reports')).status()).toBe(404);
  });
}

test("切换场景保留各自输入，只提交当前日期", async ({ page }) => {
  await page.goto("/"); await fillInfo(page);
  await selectScenario(page, "born"); await birth(page); await page.locator("[name=birthDate]").fill("2024-01-05"); await birth(page); await page.locator("[name=birthTime]").fill("13:48");
  await selectScenario(page, "due_date"); await expect(page.locator("[name=dueDate]")).toHaveValue("2099-12-23");
  await expect(page.locator("[name=birthDate]")).toHaveCount(0);
  await selectScenario(page, "born"); await expect(page.locator("[name=birthTime]")).toHaveValue("13:48");
  const pending = page.waitForRequest("**/api/analyze"); await submit(page); const input = (await pending).postDataJSON();
  expect(input).not.toHaveProperty("dueDate"); expect(input).not.toHaveProperty("dueTime");
  await expect(page.locator("#cards .card")).toHaveCount(10);
});

for(const width of [1280,390])test(`十个备选分别有真实出处与契合详情，查看不领取报告 ${width}px`,async({page})=>{
  test.setTimeout(90000);
  await page.setViewportSize({width,height:950});await page.goto('/');
  let claims=0;page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/beta-reports')claims++;});
  const response=page.waitForResponse('**/api/analyze');await generate(page);const payload=await(await response).json();
  expect(payload.candidates).toHaveLength(10);
  for(let index=0;index<10;index++){
    const item=payload.candidates[index],entry=page.locator('#cards .name-detail-entry').nth(index);
    await entry.click();const dialog=page.getByRole('dialog');
    await expect(dialog.locator('.name-detail-heading')).toContainText(item.name);
    await expect(dialog).toContainText(item.details.fit.explanation);
    await dialog.getByRole('navigation',{name:'名字详情章节'}).getByRole('button',{name:'古籍出处',exact:true}).click();
    await expect(dialog).toContainText(item.details.source.summary);
    for(const quote of item.details.source.citations){
      await expect(dialog).toContainText(quote.work);await expect(dialog).toContainText(quote.chapter);await expect(dialog).toContainText(quote.quote);
    }
    await dialog.getByRole('navigation',{name:'名字详情章节'}).getByRole('button',{name:'五行生克',exact:true}).click();
    await expect(dialog).toContainText('相克本身不等于坏名字');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(entry).toBeFocused();
  }
  expect(claims).toBe(0);
});

test('两步填写保留资料，跳过可选项也能直接生成',async({page})=>{
  await page.goto('/');let requests=0;page.on('request',r=>{if(r.url().endsWith('/api/analyze'))requests++;});
  await expect(page.locator('.birth-info')).toBeHidden();await expect(page.locator('.naming-preferences')).toBeHidden();
  await page.getByRole('button',{name:'下一步：出生信息',exact:true}).click();await expect(page.locator('[name=surname]')).toBeFocused();
  await page.locator('[name=surname]').fill('陈');await page.getByRole('button',{name:'下一步：出生信息',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'起名填写步骤'})).toBeInViewport();
  await expect(page.locator('.basic-info')).toBeHidden();await page.locator('[name=dueDate]').fill('2099-12-23');
  await page.getByRole('button',{name:'上一步',exact:true}).click();await expect(page.locator('[name=surname]')).toHaveValue('陈');
  await page.getByRole('button',{name:'下一步：出生信息',exact:true}).click();await expect(page.locator('[name=dueDate]')).toHaveValue('2099-12-23');
  await expect(page.locator('.birth-location')).not.toHaveAttribute('open','');
  await expect(page.locator('.naming-preferences')).not.toHaveAttribute('open','');
  await expect(page.locator('[name=candidateCount]')).toHaveValue('10');
  expect(requests).toBe(0);await submit(page);await expect(page.locator('#cards .card')).toHaveCount(10);expect(requests).toBe(1);
});

for(const width of [1280,390])test(`最少填写姓氏和预产期即可生成，不展开可选设置 ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:950});await page.goto('/');
  await expect(page.locator('.naming-steps button')).toHaveCount(2);
  await page.locator('[name=surname]').fill('陈');await page.getByRole('button',{name:'下一步：出生信息',exact:true}).click();
  await page.locator('[name=dueDate]').fill('2099-12-23');
  for(const selector of ['.birth-location','.naming-preferences'])await expect(page.locator(selector)).not.toHaveAttribute('open','');
  await expect(page.locator('[name=place]')).toBeHidden();await expect(page.locator('[name=meaning]')).toBeHidden();
  const response=page.waitForResponse('**/api/analyze');await page.getByRole('button',{name:'生成起名方向与提案',exact:true}).click();
  const input=(await response).request().postDataJSON();
  expect(input).toMatchObject({surname:'陈',mode:'due_date',candidateCount:'10',dueTime:'12:00',gender:'unknown',place:'',timeBasis:'civil'});
  expect(input).not.toHaveProperty('longitude');await expect(page.locator('#cards .card')).toHaveCount(10);
});

test('精简已出生流程仍校验准确时间，出生地保持可选',async({page})=>{
  await page.setViewportSize({width:390,height:950});await page.goto('/');await selectScenario(page,'born');
  await page.locator('[name=surname]').fill('陈');await page.getByRole('button',{name:'下一步：出生信息',exact:true}).click();
  await page.locator('[name=birthDate]').fill('2024-02-10');await page.getByRole('button',{name:'生成起名方向与提案',exact:true}).click();
  await expect(page.locator('[name=birthTime]')).toBeFocused();await expect(page.locator('#cards .card')).toHaveCount(0);
  await page.locator('[name=birthTime]').fill('09:30');await page.getByRole('button',{name:'生成起名方向与提案',exact:true}).click();
  await expect(page.locator('#cards .card')).toHaveCount(10);await expect(page.locator('.birth-location')).not.toHaveAttribute('open','');
});

test('改名共用一个主按钮完成分析与推荐，不重复显示确认入口',async({page})=>{
  await page.goto('/');await selectScenario(page,'rename');await page.locator('[name=currentName]').fill('欧阳明哲');
  await page.getByRole('button',{name:'下一步：出生信息',exact:true}).click();await page.locator('[name=birthDate]').fill('1998-08-13');await page.locator('[name=birthTime]').fill('13:48');
  const calls=[];page.on('request',r=>{if(/\/api\/(analyze|name-review)$/.test(r.url()))calls.push(new URL(r.url()).pathname);});
  await page.getByRole('button',{name:'分析现用姓名',exact:true}).click();await expect(page.locator('#formNameReview')).toBeVisible();
  await expect(page.getByRole('button',{name:'查看分析状态',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'查看改名提案',exact:true})).toHaveCount(1);
  expect(calls).toEqual(['/api/name-review']);await page.getByRole('button',{name:'查看改名提案',exact:true}).click();
  await expect(page.locator('#cards .card')).toHaveCount(10);expect(calls).toEqual(['/api/name-review','/api/analyze']);await expect(page.locator('#summary')).toContainText('改名方案');
});

test("出生步骤可直接生成，选填偏好回车也能提交", async ({ page }) => {
  await page.goto("/"); await fillInfo(page);
  await page.locator("[name=likedChars]").press("Enter"); await expect(page.locator("#cards .card")).toHaveCount(10);
});

test("缺少必填项定位输入，出生未来时间不能通过", async ({ page }) => {
  await page.goto("/"); await submit(page); await expect(page.locator("[name=surname]")).toBeFocused();
  await fillInfo(page, { scenario: "born", date: "2099-01-01", complete:false }); await submit(page);
  await expect(page.locator("#formMessage")).toContainText("不能晚于今天"); await expect(page.locator("[name=birthDate]")).toBeFocused();
  await birth(page); await page.locator("[name=birthDate]").fill("2024-01-05"); await birth(page); await page.locator("[name=birthTime]").fill(""); await submit(page); await expect(page.locator("[name=birthTime]")).toBeFocused();
});

test("隐藏偏好中的数量错误会展开定位，输入不会丢失", async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await openSettings(page); await page.locator("[name=candidateCount]").fill("0");
  await page.locator(".naming-preferences > summary").click(); await submit(page);
  await expect(page.locator("[name=candidateCount]")).toBeFocused(); await expect(page.locator("#formMessage")).toContainText("1–11"); await expect(page.locator("[name=surname]")).toHaveValue("林");
});

test("字库数量晚到会修正选中的数量上限", async ({ page }) => {
  let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route("**/api/name-counts*", async route => { await gate; await route.fulfill({ json: { counts: { 1: 15, 2: 15, 3: 5 } } }); });
  await page.goto("/"); await fillInfo(page); await openSettings(page); await page.locator("[name=length]").selectOption("3"); await page.locator("[name=candidateCount]").fill("11");
  release();
  await expect(page.locator("[name=candidateCount]")).toHaveValue("5");
});

test("改名分析失败可重试，出生资料变更后必须重新分析", async ({ page }) => {
  await page.goto("/"); await fillInfo(page, { scenario: "rename", currentName: "李明哲", date: "1998-08-13" });
  const abort = route => route.abort(); await page.route("**/api/name-review", abort);
  await submit(page); await expect(page.locator("#formMessage")).toContainText("无法连接");
  await page.unroute("**/api/name-review", abort); await submit(page); await expect(page.locator("#formNameReview")).toBeVisible();
  await birth(page); await page.locator("[name=birthTime]").fill("13:48"); await preferences(page); await expect(page.locator(".review-stale")).toBeVisible();
  await expect(page.getByRole("button", { name: "查看改名提案" })).toHaveCount(0);
  const response = page.waitForResponse("**/api/name-review"); await preferences(page); await page.getByRole("button", { name: "重新分析现用姓名", exact: true }).click();
  const updated=await response;expect(updated.request().postDataJSON().birthTime).toBe("13:48");expect((await updated.json()).analysis.review_completed).toBe(true);
  await page.getByRole("button", { name: "查看改名提案", exact: true }).click(); await expect(page.locator("#cards .card")).toHaveCount(10);
});

test("现名报告可重复查看且不重复请求，未来偏好不阻挡分析", async ({ page }) => {
  await page.goto("/"); await fillInfo(page, { scenario: "rename", currentName: "李明哲", date: "1998-08-13" });
  await openDetail(page, ".naming-constraints"); await page.locator("[name=requiredChars]").fill("安"); await page.locator("[name=tabooChars]").fill("安");
  let requests = 0; page.on("request", r => { if (r.url().endsWith("/api/name-review")) requests++; });
  await submit(page); await expect(page.locator("#formNameReview")).toBeVisible();
  await submit(page); expect(requests).toBe(1);
  await page.getByRole("button", { name: "查看改名提案", exact: true }).click(); await expect(page.locator("#formMessage")).toContainText("冲突"); await expect(page.locator("[name=requiredChars]")).toBeFocused();
});

test("识别的姓氏可修正，修改名字后保留明确的姓氏设置", async ({ page }) => {
  await page.goto("/"); await selectScenario(page, "rename"); await basic(page); await page.locator("[name=currentName]").fill("阿布知远");
  await page.getByRole("button", { name: "修改姓氏", exact: true }).click(); await expect(page.locator("[name=surname]")).toBeFocused(); await basic(page); await page.locator("[name=surname]").fill("阿布");
  await basic(page); await page.locator("[name=currentName]").fill("阿布安宁"); await expect(page.locator(".surname-detection")).toContainText("阿布");
  await selectScenario(page, "due_date"); await basic(page); await page.locator("[name=surname]").fill("林"); await selectScenario(page, "rename"); await expect(page.locator(".surname-detection")).toContainText("阿布"); await selectScenario(page, "due_date"); await expect(page.locator("[name=surname]")).toHaveValue("林");
});

test("切换到改名立即收起新生儿旧方案和下载入口", async ({ page }) => {
  await page.goto("/"); await generate(page); await selectScenario(page, "rename");
  await expect(page.locator("#cards .card")).toHaveCount(0); await expect(page.locator("#downloadReport")).toHaveCount(0); await expect(page.locator("#summary")).toHaveCount(0);
});

test("修改偏好需要应用，失败保留旧结果并可重试", async ({ page }) => {
  await page.goto("/"); await generate(page); const names = await page.locator("#cards h3").allTextContents();
  await page.getByRole("button", { name: "调整偏好", exact: true }).first().click(); await expect(page.locator("#preferencesTitle")).toBeFocused(); await page.locator("[name=likedChars]").fill("安");
  await expect(page.getByRole("region", { name: "尚未应用的修改" })).toBeVisible(); const abort = route => route.abort(); await page.route("**/api/analyze", abort);
  await page.getByRole("button", { name: "应用修改并生成", exact: true }).click(); await expect(page.locator("#formMessage")).toContainText("无法连接"); expect(await page.locator("#cards h3").allTextContents()).toEqual(names); await expect(page.locator("#downloadReport")).toHaveCount(0);
  await page.unroute("**/api/analyze", abort); const request = page.waitForRequest("**/api/analyze"); await page.getByRole("button", { name: "应用修改并生成", exact: true }).click(); expect((await request).postDataJSON().likedChars).toBe("安"); await expect(page.getByRole("region", { name: "尚未应用的修改" })).toHaveCount(0);
});

test("上一组和下一组使用缓存，比较可跨组保留", async ({ page }) => {
  await page.goto("/"); await generate(page); const original = await page.locator("#cards h3").allTextContents(); let requests = 0;
  page.on("request", r => { if (r.url().endsWith("/api/analyze")) requests++; });
  await page.locator("#cards .compare-name").first().click(); await page.locator("#regenerate").click(); await expect(page.locator("#resultStatus")).toContainText("第 2 组"); await expect(page.locator("#candidateComparison")).toContainText("已选 1/3");
  await page.locator("#cards .compare-name").first().click(); await page.locator("#previousGroup").click(); expect(await page.locator("#cards h3").allTextContents()).toEqual(original);
  await page.locator("#regenerate").click(); expect(requests).toBe(1); await expect(page.locator("#candidateComparison")).toContainText("已选 2/3");
  await page.locator('#candidateComparison').getByRole('button',{name:`查看${original[0]}的名字详情`,exact:true}).click();
  await expect(page.getByRole('dialog').locator('.name-detail-heading')).toContainText(original[0]);
  await page.keyboard.press('Escape');expect(requests).toBe(1);
});

for (const width of [1280, 390, 320]) test(`生成后可直接用键盘进入结果和比较 ${width}px`, async ({page})=>{
  await page.setViewportSize({width,height:950});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');await generate(page);
  await expect(page.locator('#results')).toBeFocused();
  const shortcuts=page.getByRole('navigation',{name:'提案快捷操作'});
  await expect(shortcuts.getByRole('link',{name:/查看比较/})).toHaveCount(0);
  await page.locator('#cards .compare-name').first().click();
  const compare=shortcuts.getByRole('link',{name:/查看比较/});
  await compare.focus();await page.keyboard.press('Enter');
  const panel=page.getByRole('region',{name:'名字比较',exact:true});
  await expect(panel).toBeFocused();await expect(panel).toBeInViewport();
  const top=await panel.evaluate(el=>el.getBoundingClientRect().top);
  const navigationBottom=await page.locator('.site-header').evaluate(el=>el.getBoundingClientRect().bottom);
  expect(top).toBeGreaterThanOrEqual(navigationBottom);
  const shortcutBottom=await shortcuts.evaluate(el=>el.getBoundingClientRect().bottom);
  expect(top).toBeGreaterThanOrEqual(shortcutBottom);
  await panel.getByRole('button',{name:'清空比较',exact:true}).click();
  await expect(compare).toHaveCount(0);
  await shortcuts.getByRole('button',{name:'调整条件',exact:true}).click();
  await expect(page.locator('#preferencesTitle')).toBeFocused();
});

test("比较最多三个，可移除后继续选", async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await openSettings(page); await page.locator("[name=candidateCount]").fill("4"); await submit(page); await expect(page.locator("#cards .card")).toHaveCount(4);
  for (let i = 0; i < 3; i++) await page.locator("#cards .compare-name").nth(i).click(); await expect(page.locator("#cards .compare-name").nth(3)).toBeDisabled();
  await page.locator("#cards .compare-name").first().click(); await expect(page.locator("#cards .compare-name").nth(3)).toBeEnabled();
});

for (const length of [1, 3]) test(`${length}字名可选择11个方案且保留必用字`, async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await openSettings(page); await page.locator("[name=length]").selectOption(String(length)); await page.locator("[name=candidateCount]").fill("11");
  if (length === 3) { await openDetail(page, ".naming-constraints"); await page.locator("[name=requiredChars]").fill("安"); }
  await submit(page); await expect(page.locator("#cards .card")).toHaveCount(11);
  const names = await page.locator("#cards h3").allTextContents(); expect(names.every(n => [...n].length === length + 1)).toBeTruthy(); expect(new Set(names).size).toBe(11); if (length === 3) expect(names.every(n => n.includes("安"))).toBeTruthy();
});

test("必用字与避讳生效，冲突展开定位且旧结果保留", async ({ page }) => {
  await page.goto("/"); await fillInfo(page, { surname: "欧阳" }); await openDetail(page, ".naming-constraints"); await page.locator("[name=requiredChars]").fill("安"); await page.locator("[name=tabooChars]").fill("宁"); await submit(page); await expect(page.locator("#cards .card")).toHaveCount(10);
  const names = await page.locator("#cards h3").allTextContents(); expect(names.every(n => n.includes("安") && !n.includes("宁"))).toBeTruthy(); await page.locator("[name=avoidedChars]").fill("安");
  await page.locator(".naming-preferences > summary").click(); await submit(page); await expect(page.locator("[name=requiredChars]")).toBeFocused(); await expect(page.locator("#formMessage")).toContainText("冲突"); expect(await page.locator("#cards h3").allTextContents()).toEqual(names);
});

test("未覆盖必用字返回空候选，修改入口直接定位", async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await openDetail(page, ".naming-constraints"); await page.locator("[name=requiredChars]").fill("龘"); await submit(page); await expect(page.locator("#cards .empty-result")).toContainText("龘"); await expect(page.locator("#downloadReport")).toHaveCount(0);
  await page.getByRole("button", { name: "调整必用字或避讳", exact: true }).click(); await expect(page.locator("[name=requiredChars]")).toBeFocused();
});

test("单字必用只有一个结果，看完不循环", async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await openSettings(page); await page.locator("[name=length]").selectOption("1"); await openDetail(page, ".naming-constraints"); await page.locator("[name=requiredChars]").fill("安"); await submit(page); await expect(page.locator("#cards .card")).toHaveCount(1); await expect(page.locator("#regenerate")).toBeDisabled();
  const guide=page.locator('.selection-guide');await guide.getByRole('button',{name:'从第一个名字开始了解',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'继续看下一个名字',exact:true})).toHaveCount(0);
  await dialog.getByRole('button',{name:'收藏这个名字',exact:true}).click();await page.keyboard.press('Escape');
  await expect(guide.getByRole('button',{name:'继续了解下一个名字',exact:true})).toHaveCount(0);
  await guide.getByRole('button',{name:'查看收藏名单',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('本机收藏');
});

test("五格严格筛选与未知笔画可以调整", async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await openDetail(page, ".naming-constraints"); await page.locator("[name=numerologyMode]").selectOption("strict");
  let response = page.waitForResponse("**/api/analyze"); await submit(page); expect((await (await response).json()).candidates.every(x => !x.numerology)).toBeTruthy(); await expect(page.locator("#cards .card")).toHaveCount(10);
  await page.locator("[name=requiredChars]").fill("清"); await submit(page); await expect(page.locator("#cards .empty-result")).toBeVisible();
  await page.getByRole("button", { name: "调整数理筛选", exact: true }).click(); await expect(page.locator("[name=numerologyMode]")).toBeFocused(); await page.locator("[name=numerologyMode]").selectOption("off"); await submit(page); await expect(page.locator("#cards .card")).toHaveCount(10);
});

test("多音姓读法贯穿生成和报告", async ({ page }) => {
  await page.goto("/"); await fillInfo(page, { surname: "单" }); await openDetail(page, ".family-options"); await page.locator("[name=surnameReading]").fill("dān"); const response = page.waitForResponse("**/api/analyze"); await submit(page); expect((await (await response).json()).candidates.every(x => x.pinyin.startsWith("dān "))).toBeTruthy(); await expect(page.locator("#cards .pinyin").first()).toContainText("dān");
});

for(const width of [1280,390]) test(`真太阳时选项参与请求但完整依据由后台交付 ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:950});await page.goto('/');await fillInfo(page,{scenario:'born',date:'2024-02-10',time:'23:05',place:'喀什'});
  await openDetail(page,'.time-settings');await page.locator('[name=timeBasis]').selectOption('apparent_solar');await expect(page.locator('[name=longitude]')).toHaveValue('75.99');
  const pending=page.waitForResponse('**/api/analyze');await submit(page);const response=await pending;
  expect(response.request().postDataJSON()).toMatchObject({timeBasis:'apparent_solar',longitude:'75.99',locationId:'kashgar'});expect((await response.json()).analysis).not.toHaveProperty('bazi');
  await expect(page.locator('#cards .card')).toHaveCount(10);await expect(page.locator('#summary .time-basis-note')).toHaveCount(0);
});

test("真太阳时缺失经度会展开定位，输入完整可继续", async ({ page }) => {
  await page.goto("/"); await fillInfo(page, { place: "未收录地点" }); await openDetail(page, ".time-settings"); await page.locator("[name=timeBasis]").selectOption("apparent_solar"); await page.locator(".birth-location > summary").click(); await submit(page); await expect(page.locator("[name=longitude]")).toBeFocused(); await page.locator("[name=longitude]").fill("120.16"); await submit(page); await expect(page.locator("#cards .card")).toHaveCount(10);
});

for (const scenario of ["due_date", "born", "rename"]) test(`民用时间不填城市也能完成${scenario}`, async ({ page }) => {
  await page.setViewportSize({width:390,height:950}); await page.goto("/");
  await fillInfo(page, {scenario, place:"", date:scenario === "due_date" ? "2099-12-23" : "2024-02-10"});
  await expect(page.locator("#placeHelp")).toContainText("可留空");
  if (scenario === "rename") {
    await submit(page); await expect(page.locator("#formNameReview")).toBeVisible();
    await expect(page.locator("#formNameReview")).toContainText("现名分析已完成");
  }
  const pending=page.waitForRequest("**/api/analyze");
  if (scenario === "rename") await page.getByRole("button", {name:"查看改名提案",exact:true}).click();
  else await submit(page);
  const data=(await pending).postDataJSON(); expect(data.place).toBe(""); expect(data).not.toHaveProperty("longitude"); expect(data).not.toHaveProperty("locationId");
  await expect(page.locator("#cards .card")).toHaveCount(10); await expect(page.locator("#summary")).toContainText("免费提案");
  await expect(page.locator("#downloadReport")).toHaveCount(0);
});

test("城市只选一次，更换地点清除旧经度，手动0经度可用", async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await openDetail(page, ".time-settings"); await page.locator("[name=timeBasis]").selectOption("apparent_solar");
  await expect(page.locator("[name=longitude]")).toHaveValue("120.16");
  await page.locator("[name=longitude]").fill(""); await page.getByRole("button", {name:"恢复杭州城市中心经度",exact:true}).click(); await expect(page.locator("[name=longitude]")).toHaveValue("120.16");
  await page.locator("[name=longitude]").fill("120.15"); await location(page); await page.locator("[name=place]").fill("杭州市"); await expect(page.locator("[name=longitude]")).toHaveValue("120.15");
  await location(page); await page.locator("[name=place]").fill("成都"); await expect(page.locator("[name=longitude]")).toHaveValue("104.07");
  await location(page); await page.locator("[name=place]").fill(""); await expect(page.locator("[name=longitude]")).toHaveValue(""); await expect(page.locator("[name=locationId]")).toHaveValue("");
  await submit(page); await expect(page.locator("[name=longitude]")).toBeFocused();
  await page.locator("[name=longitude]").fill("0"); const pending=page.waitForResponse("**/api/analyze"); await submit(page);
  await expect(page.locator("#placeHelp")).toContainText("已填写手动经度0°E");
  const response=await pending;expect(response.request().postDataJSON().longitude).toBe("0");const value=await response.json();expect(value.analysis.access).toBe("proposal_only");
  await expect(page.locator("#cards .card")).toHaveCount(10); await expect(page.locator("#summary .time-basis-note")).toHaveCount(0);
});

test("真太阳时切回民用时间时不提交经度，重新启用仍保留调整", async ({ page }) => {
  await page.goto("/"); await fillInfo(page,{place:"臺北市"}); await openDetail(page,".time-settings"); await page.locator("[name=timeBasis]").selectOption("apparent_solar");
  await expect(page.locator("[name=longitude]")).toHaveValue("121.57"); await expect(page.locator("[name=zone]")).toHaveValue("Asia/Taipei");
  await page.locator("[name=longitude]").fill("121.56"); await page.locator("[name=timeBasis]").selectOption("civil");
  const pending=page.waitForRequest("**/api/analyze"); await submit(page); const data=(await pending).postDataJSON(); expect(data).not.toHaveProperty("longitude"); expect(data).not.toHaveProperty("locationId");
  await expect(page.locator("#cards .card")).toHaveCount(10); await birth(page); await page.locator("[name=timeBasis]").selectOption("apparent_solar"); await expect(page.locator("[name=longitude]")).toHaveValue("121.56");
});

test("改名换城市后重新分析，并把同一修正依据用于推荐", async ({ page }) => {
  await page.goto("/"); await fillInfo(page,{scenario:"rename",currentName:"李明哲",date:"2024-02-10"}); await openDetail(page,".time-settings"); await page.locator("[name=timeBasis]").selectOption("apparent_solar");
  await submit(page); await expect(page.locator("#formNameReview")).toBeVisible();
  await location(page); await page.locator("[name=place]").fill("成都"); await preferences(page); await expect(page.locator(".review-stale")).toBeVisible();
  const pending=page.waitForResponse("**/api/name-review"); await preferences(page); await page.getByRole("button",{name:"重新分析现用姓名",exact:true}).click();
  const response=await pending;expect(response.request().postDataJSON()).toMatchObject({place:"成都",longitude:"104.07"});const review=await response.json();expect(review.analysis.review_completed).toBe(true);
  const recommendation=page.waitForResponse("**/api/analyze"); await page.getByRole("button",{name:"查看改名提案",exact:true}).click();
  const selected=await recommendation;expect(selected.request().postDataJSON()).toMatchObject({place:"成都",longitude:"104.07"});expect((await selected.json()).analysis).not.toHaveProperty("bazi");
});

for (const [status, body, text] of [[404, "missing", "未接通起名接口"], [502, "<html>bad gateway</html>", "暂时不可用"], [200, "<html>static page</html>", "无法识别"]]) test(`接口错误${status}-${text}可见并支持重试`, async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await page.route("**/api/analyze", route => route.fulfill({ status, contentType: "text/html", body })); await submit(page); await expect(page.locator("#formMessage")).toContainText(text); await expect(page.locator("#formMessage")).toBeInViewport(); await expect(page.locator("button[type=submit]")).toBeEnabled(); await expect(page.locator("#cards .card")).toHaveCount(0);
});

test("重复点击只提交一次，等待结束后可重试", async ({ page }) => {
  await page.goto("/"); await fillInfo(page); let count = 0; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const hold = async route => { count++; await gate; await route.continue(); }; await page.route("**/api/analyze", hold);
  await submit(page); await expect(page.locator("button[type=submit]")).toBeDisabled(); await page.locator("button[type=submit]").evaluate(el => el.click()); expect(count).toBe(1); release(); await expect(page.locator("#cards .card")).toHaveCount(10);
});

test("收藏搜索、复制、清空撤销和Esc返回保持完整", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { window.__copied = text; } } }); });
  await page.goto("/"); await generate(page); await page.locator("#cards .save").first().click(); const name = await page.locator("#cards h3").first().textContent(); await page.locator("#savedButton").click(); const panel = page.locator("#savedPanel"); await expect(panel).toBeVisible();
  await panel.getByLabel("查找收藏").fill("不存在的名字"); await expect(panel).toContainText("没有找到匹配"); await panel.getByRole("button", { name: "查看全部收藏", exact: true }).click();
  await panel.getByRole("button", { name: "复制收藏清单", exact: true }).click(); const copied = await page.evaluate(() => window.__copied); expect(copied).toContain(name); expect(copied).not.toContain("2099");
  await panel.getByRole("button", { name: "清空本机收藏", exact: true }).click(); await panel.getByRole("button", { name: "撤销", exact: true }).click(); await expect(panel).toContainText(name); await page.keyboard.press("Escape"); await expect(panel).toBeHidden(); await expect(page.locator("#savedButton")).toBeFocused();
});

test("旧收藏可用，心愿卡与推荐链接不含出生信息", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("序名收藏", JSON.stringify(["林安"])); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { window.__copied = text; } } }); });
  await page.goto("/?birthDate=秘密#private"); await generate(page); await page.locator("#cards .make-keepsake").first().click(); const pending = page.waitForEvent("download"); await page.locator("#downloadKeepsake").click(); const file = await readFile(await (await pending).path()); expect(file.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  await page.locator("#copySiteLink").click(); const link = await page.evaluate(() => window.__copied); expect(link).not.toContain("birthDate"); expect(link).not.toContain("秘密"); expect(link).toContain("utm_source=share");
});

test("320px键盘可选择场景和操作导航，减少动态效果生效", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 }); await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/"); await page.locator("[name=scenario][value=rename]").focus(); await page.keyboard.press("Space"); await expect(page.locator("[name=currentName]")).toBeVisible();
  const button = page.locator("#mobileMenuButton"); await button.focus(); await page.keyboard.press("Enter"); await expect(page.locator("#mobileMenu")).toBeVisible(); await page.keyboard.press("Escape"); await expect(button).toBeFocused();
  expect(await page.locator('.scenario-choices label').first().evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("清理旧版本缓存，匿名使用不要求登录购买", async ({ page }) => {
  await page.goto("/"); await page.evaluate(async () => { await (await navigator.serviceWorker.ready).unregister(); const cache = await caches.open("xuming-mvp-v26"); await cache.put("/old", new Response("old")); }); await page.reload();
  await page.waitForFunction(async () => !(await caches.keys()).includes("xuming-mvp-v26")); await generate(page); await expect(page.getByRole("button", { name: "立即购买" })).toHaveCount(0);
});

test("超时结束等待并保留输入，可以重试生成", async ({ page }) => {
  await page.goto("/"); await fillInfo(page);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const hold = async route => { await gate; try { await route.abort(); } catch {} };
  await page.route("**/api/analyze", hold);
  await submit(page);
  await expect(page.locator("#formMessage")).toContainText("响应超时", { timeout: 20000 });
  await expect(page.locator("button[type=submit]")).toBeEnabled();
  await expect(page.locator("[name=dueDate]")).toHaveValue("2099-12-23");
  release(); await page.unroute("**/api/analyze", hold);
  await submit(page); await expect(page.locator("#cards .card")).toHaveCount(10);
});

test("折叠偏好不丢设置，选城市带入对应时区", async ({ page }) => {
  await page.goto("/"); await fillInfo(page, { place: "台北" });
  await basic(page); await page.locator("[name=gender]").selectOption("female");
  await openSettings(page); await page.locator("[name=length]").selectOption("1"); await page.locator("[name=candidateCount]").fill("7");
  await page.locator("[name=likedChars]").fill("安"); await page.locator(".naming-preferences > summary").click();
  const pending = page.waitForRequest("**/api/analyze"); await submit(page);
  expect((await pending).postDataJSON()).toMatchObject({ gender: "female", length: "1", candidateCount: "7", likedChars: "安", zone: "Asia/Taipei" });
  await expect(page.locator("#cards .card")).toHaveCount(7);
});

test("表单资料不落本机收藏，离线仍能制作心愿卡", async ({ page, context }) => {
  await page.goto("/"); await generate(page); await page.locator("#cards .save").first().click();
  const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  expect(stored).not.toContain("2099-12-23"); expect(stored).not.toContain("dueDate"); expect(stored).not.toContain("birthDate");
  await page.evaluate(() => navigator.serviceWorker.ready); await context.setOffline(true); await page.reload();
  await page.locator("#keepsakeTools > summary").click();
  await page.locator("#keepsakeName").fill("林安");
  const pending = page.waitForEvent("download"); await page.locator("#downloadKeepsake").click(); const image = await readFile(await (await pending).path());
  expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
});

test.describe('素材故障恢复',()=>{
test.use({serviceWorkers:'block'});
test('心愿卡素材加载失败后可重试，成功后才下载完整图片', async ({page})=>{
  let reachable=false;
  await page.route('**/assets/moon-mountains-*.webp',route=>reachable?route.continue():route.abort());
  await page.goto('/');await page.locator('#keepsakeTools > summary').click();
  await page.locator('#keepsakeName').fill('林安');
  const files=[];page.on('download',file=>files.push(file));
  await page.locator('#downloadKeepsake').click();
  await expect(page.locator('#toast')).toContainText('山水素材暂未加载成功');
  await expect(page.locator('#downloadKeepsake')).toBeEnabled();expect(files).toHaveLength(0);
  reachable=true;
  const pending=page.waitForEvent('download');await page.locator('#downloadKeepsake').click();
  const bytes=await readFile(await(await pending).path());
  expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(files).toHaveLength(1);
});
});

test("宝宝与改名对象的出生资料分别保留，不自动混填", async ({ page }) => {
  await page.goto("/"); await fillInfo(page, { scenario: "born", date: "2024-01-05", time: "12:00", place: "杭州" }); await basic(page); await page.locator("[name=gender]").selectOption("male");
  await selectScenario(page, "rename"); await basic(page); await page.locator("[name=currentName]").fill("李明哲");
  await expect(page.locator("[name=birthDate]")).toHaveValue(""); await expect(page.locator("[name=place]")).toHaveValue(""); await expect(page.locator("[name=gender]")).toHaveValue("unknown");
  await birth(page); await page.locator("[name=birthDate]").fill("1998-08-13"); await birth(page); await page.locator("[name=birthTime]").fill("13:48"); await location(page); await page.locator("[name=place]").fill("台北");
  await selectScenario(page, "born"); await expect(page.locator("[name=birthDate]")).toHaveValue("2024-01-05"); await expect(page.locator("[name=place]")).toHaveValue("杭州"); await expect(page.locator("[name=gender]")).toHaveValue("male");
  await selectScenario(page, "rename"); await expect(page.locator("[name=birthDate]")).toHaveValue("1998-08-13"); await expect(page.locator("[name=zone]")).toHaveValue("Asia/Taipei");
});

test('联系方式仅展示复制，不提交出生资料或解锁报告',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copied=value;}}}));
  const calls=[];page.on('request',r=>{if(r.url().includes('report-requests'))calls.push(r.url());});
  await page.goto('/');await generate(page);const section=page.getByRole('region',{name:'联系方式',exact:true});
  await expect(section.getByRole('checkbox')).toHaveCount(0);await expect(section).not.toContainText('解锁');
  await section.getByRole('button',{name:'复制微信号'}).click();expect(await page.evaluate(()=>window.__copied)).toBe('LCEX511');
  await section.getByRole('button',{name:'复制QQ号'}).click();expect(await page.evaluate(()=>window.__copied)).toBe('19437771');expect(calls).toEqual([]);
});

test('名额失败不伪造零，保留真实值并忽略过时响应',async({page})=>{
  let version=1;
  await page.route('**/api/beta-quota',route=>route.fulfill(version===3?{status:503,json:{available:false}}:{json:{available:true,total:100,used:version===1?12:8,remaining:version===1?88:92,enabled:true,revision:version===1?13:9}}));
  await page.goto('/');await expect(page.locator('[data-quota=used]')).toHaveText('12');
  version=2;await page.getByRole('button',{name:'刷新体验名额'}).click();await expect(page.locator('[data-quota=used]')).toHaveText('12');
  version=3;await page.getByRole('button',{name:'刷新体验名额'}).click();await expect(page.locator('#trialQuota')).toContainText('待刷新');await expect(page.locator('[data-quota=used]')).toHaveText('12');
});
