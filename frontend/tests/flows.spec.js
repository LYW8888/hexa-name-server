import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function selectScenario(page, scenario) {
  await page.locator(`[name=scenario][value=${scenario}]`).locator("..").click();
}
async function openSettings(page) {
  const details = page.locator(".naming-preferences");
  if (!(await details.evaluate(el => el.open))) await details.locator(":scope > summary").click();
}
async function openDetail(page, selector) {
  await openSettings(page);
  const details = page.locator(selector);
  if (!(await details.evaluate(el => el.open))) await details.locator(":scope > summary").click();
}
async function fillInfo(page, { scenario = "due_date", surname = "林", currentName = "林明哲", date = "2099-12-23", time = "12:00", place = "杭州" } = {}) {
  if (scenario !== "due_date") await selectScenario(page, scenario);
  if (scenario === "rename") await page.locator("[name=currentName]").fill(currentName);
  else await page.locator("[name=surname]").fill(surname);
  await page.locator(`[name=${scenario === "due_date" ? "dueDate" : "birthDate"}]`).fill(date);
  if (scenario !== "due_date") await page.locator("[name=birthTime]").fill(time);
  await page.locator("[name=place]").fill(place);
}
async function generate(page, options = {}) {
  await fillInfo(page, options);
  await page.locator("#namingForm button[type=submit]").click();
  await expect(page.locator("#cards .card")).toHaveCount(3);
}

for (const width of [1280, 390]) {
  test(`首页三个入口同步场景且保留各自资料 ${width}px`, async ({page})=>{
    await page.setViewportSize({width,height:950});await page.goto('/');
    const launcher=page.getByRole('group',{name:'快捷选择起名场景'});
    await launcher.getByRole('button',{name:'预产期起名',exact:true}).click();
    await expect(page.locator('[name=scenario][value=due_date]')).toBeChecked();
    await page.locator('[name=surname]').fill('林');await page.locator('[name=dueDate]').fill('2099-12-23');
    await launcher.getByRole('button',{name:'已出生起名',exact:true}).click();
    await expect(page.locator('[name=scenario][value=born]')).toBeChecked();await expect(page.locator('[name=dueDate]')).toHaveCount(0);
    await page.locator('[name=birthDate]').fill('2024-01-05');await page.locator('[name=birthTime]').fill('13:48');
    await launcher.getByRole('button',{name:'改名',exact:true}).click();
    await expect(page.locator('[name=currentName]')).toBeVisible();await expect(page.locator('[name=birthDate]')).toHaveValue('');
    await page.locator('[name=currentName]').fill('欧阳明哲');
    await launcher.getByRole('button',{name:'预产期起名',exact:true}).click();
    await expect(launcher.getByRole('button',{name:'预产期起名',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('[name=currentName]')).toHaveCount(0);await expect(page.locator('[name=dueDate]')).toHaveValue('2099-12-23');
    const request=page.waitForRequest('**/api/analyze');await page.locator('#namingForm button[type=submit]').click();
    expect((await request).postDataJSON()).toMatchObject({surname:'林',purpose:'newborn',mode:'due_date'});
    await expect(page.locator('#cards .card')).toHaveCount(3);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  });
  test(`首次预产期起名一页填写、一次生成 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/");
    await expect(page.locator(".naming-preferences")).not.toHaveAttribute("open", "");
    await expect(page.locator("[name=length]")).toBeHidden();
    await expect(page.locator("[name=dueTime]")).toBeHidden();
    let calls = 0;
    page.on("request", request => { if (request.url().endsWith("/api/analyze")) calls++; });
    await fillInfo(page);
    const request = page.waitForRequest("**/api/analyze");
    await page.getByRole("button", { name: "生成名字提案 ✦", exact: true }).click();
    const input = (await request).postDataJSON();
    await expect(page.locator("#cards .card")).toHaveCount(3);
    expect(calls).toBe(1);
    expect(input).toMatchObject({ purpose: "newborn", mode: "due_date", dueTime: "12:00", length: "2", candidateCount: "3", gender: "unknown", algorithm: "literary_v3" });
    expect(input).not.toHaveProperty("birthDate");
    expect(input).not.toHaveProperty("scenario");
    await expect(page.locator("#summary")).toContainText("新生儿起名 · 预产期");
    await expect(page.locator("#namingForm")).not.toContainText("下一步");
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
    await expect(page.locator("#cards .card")).toHaveCount(3);
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
    for(const item of value.candidates)expect(Object.keys(item).sort()).toEqual(['given','meaning','name','pinyin']);
    await expect(page.locator('#cards details')).toHaveCount(0);await expect(page.locator('#downloadReport')).toHaveCount(0);
    await expect(page.locator('#reportRequest')).toContainText('LCEX511');await expect(page.locator('#reportRequest')).toContainText('19437771');
    expect((await page.request.get('/api/reports')).status()).toBe(404);
  });
}

test("切换场景保留各自输入，只提交当前日期", async ({ page }) => {
  await page.goto("/"); await fillInfo(page);
  await selectScenario(page, "born"); await page.locator("[name=birthDate]").fill("2024-01-05"); await page.locator("[name=birthTime]").fill("13:48");
  await selectScenario(page, "due_date"); await expect(page.locator("[name=dueDate]")).toHaveValue("2099-12-23");
  await expect(page.locator("[name=birthDate]")).toHaveCount(0);
  await selectScenario(page, "born"); await expect(page.locator("[name=birthTime]")).toHaveValue("13:48");
  const pending = page.waitForRequest("**/api/analyze"); await page.locator("button[type=submit]").click(); const input = (await pending).postDataJSON();
  expect(input).not.toHaveProperty("dueDate"); expect(input).not.toHaveProperty("dueTime");
  await expect(page.locator("#cards .card")).toHaveCount(3);
});

test("一页表单回车直接生成，不再跳转步骤", async ({ page }) => {
  await page.goto("/"); await fillInfo(page);
  await page.locator("[name=place]").press("Enter"); await expect(page.locator("#cards .card")).toHaveCount(3);
});

test("缺少必填项定位输入，出生未来时间不能通过", async ({ page }) => {
  await page.goto("/"); await page.locator("button[type=submit]").click(); await expect(page.locator("[name=surname]")).toBeFocused();
  await fillInfo(page, { scenario: "born", date: "2099-01-01" }); await page.locator("button[type=submit]").click();
  await expect(page.locator("#formMessage")).toContainText("不能晚于今天"); await expect(page.locator("[name=birthDate]")).toBeFocused();
  await page.locator("[name=birthDate]").fill("2024-01-05"); await page.locator("[name=birthTime]").fill(""); await page.locator("button[type=submit]").click(); await expect(page.locator("[name=birthTime]")).toBeFocused();
});

test("隐藏偏好中的数量错误会展开定位，输入不会丢失", async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await openSettings(page); await page.locator("[name=candidateCount]").fill("0");
  await page.locator(".naming-preferences > summary").click(); await page.locator("button[type=submit]").click();
  await expect(page.locator("[name=candidateCount]")).toBeFocused(); await expect(page.locator("#formMessage")).toContainText("1–11"); await expect(page.locator("[name=surname]")).toHaveValue("林");
});

test("字库数量晚到会修正选中的数量上限", async ({ page }) => {
  let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route("**/api/name-counts*", async route => { await gate; await route.fulfill({ json: { counts: { 1: 15, 2: 15, 3: 5 } } }); });
  await page.goto("/"); await openSettings(page); await page.locator("[name=length]").selectOption("3"); await page.locator("[name=candidateCount]").fill("11");
  release();
  await expect(page.locator("[name=candidateCount]")).toHaveValue("5");
});

test("改名分析失败可重试，出生资料变更后必须重新分析", async ({ page }) => {
  await page.goto("/"); await fillInfo(page, { scenario: "rename", currentName: "李明哲", date: "1998-08-13" });
  const abort = route => route.abort(); await page.route("**/api/name-review", abort);
  await page.locator("button[type=submit]").click(); await expect(page.locator("#formMessage")).toContainText("无法连接");
  await page.unroute("**/api/name-review", abort); await page.locator("button[type=submit]").click(); await expect(page.locator("#formNameReview")).toBeVisible();
  await page.locator("[name=birthTime]").fill("13:48"); await expect(page.locator(".review-stale")).toBeVisible();
  await expect(page.getByRole("button", { name: "查看改名提案" })).toHaveCount(0);
  const response = page.waitForResponse("**/api/name-review"); await page.getByRole("button", { name: "重新分析现用姓名", exact: true }).click();
  const updated=await response;expect(updated.request().postDataJSON().birthTime).toBe("13:48");expect((await updated.json()).analysis.review_completed).toBe(true);
  await page.getByRole("button", { name: "查看改名提案", exact: true }).click(); await expect(page.locator("#cards .card")).toHaveCount(3);
});

test("现名报告可重复查看且不重复请求，未来偏好不阻挡分析", async ({ page }) => {
  await page.goto("/"); await fillInfo(page, { scenario: "rename", currentName: "李明哲", date: "1998-08-13" });
  await openDetail(page, ".naming-constraints"); await page.locator("[name=requiredChars]").fill("安"); await page.locator("[name=tabooChars]").fill("安");
  let requests = 0; page.on("request", r => { if (r.url().endsWith("/api/name-review")) requests++; });
  await page.locator("button[type=submit]").click(); await expect(page.locator("#formNameReview")).toBeVisible();
  await page.locator("button[type=submit]").click(); expect(requests).toBe(1);
  await page.getByRole("button", { name: "查看改名提案", exact: true }).click(); await expect(page.locator("#formMessage")).toContainText("冲突"); await expect(page.locator("[name=requiredChars]")).toBeFocused();
});

test("识别的姓氏可修正，修改名字后保留明确的姓氏设置", async ({ page }) => {
  await page.goto("/"); await selectScenario(page, "rename"); await page.locator("[name=currentName]").fill("阿布知远");
  await page.getByRole("button", { name: "修改姓氏", exact: true }).click(); await expect(page.locator("[name=surname]")).toBeFocused(); await page.locator("[name=surname]").fill("阿布");
  await page.locator("[name=currentName]").fill("阿布安宁"); await expect(page.locator(".surname-detection")).toContainText("阿布");
  await selectScenario(page, "due_date"); await page.locator("[name=surname]").fill("林"); await selectScenario(page, "rename"); await expect(page.locator(".surname-detection")).toContainText("阿布"); await selectScenario(page, "due_date"); await expect(page.locator("[name=surname]")).toHaveValue("林");
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
});

test("比较最多三个，可移除后继续选", async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await openSettings(page); await page.locator("[name=candidateCount]").fill("4"); await page.locator("button[type=submit]").click(); await expect(page.locator("#cards .card")).toHaveCount(4);
  for (let i = 0; i < 3; i++) await page.locator("#cards .compare-name").nth(i).click(); await expect(page.locator("#cards .compare-name").nth(3)).toBeDisabled();
  await page.locator("#cards .compare-name").first().click(); await expect(page.locator("#cards .compare-name").nth(3)).toBeEnabled();
});

for (const length of [1, 3]) test(`${length}字名可选择11个方案且保留必用字`, async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await openSettings(page); await page.locator("[name=length]").selectOption(String(length)); await page.locator("[name=candidateCount]").fill("11");
  if (length === 3) { await openDetail(page, ".naming-constraints"); await page.locator("[name=requiredChars]").fill("安"); }
  await page.locator("button[type=submit]").click(); await expect(page.locator("#cards .card")).toHaveCount(11);
  const names = await page.locator("#cards h3").allTextContents(); expect(names.every(n => [...n].length === length + 1)).toBeTruthy(); expect(new Set(names).size).toBe(11); if (length === 3) expect(names.every(n => n.includes("安"))).toBeTruthy();
});

test("必用字与避讳生效，冲突展开定位且旧结果保留", async ({ page }) => {
  await page.goto("/"); await fillInfo(page, { surname: "欧阳" }); await openDetail(page, ".naming-constraints"); await page.locator("[name=requiredChars]").fill("安"); await page.locator("[name=tabooChars]").fill("宁"); await page.locator("button[type=submit]").click(); await expect(page.locator("#cards .card")).toHaveCount(3);
  const names = await page.locator("#cards h3").allTextContents(); expect(names.every(n => n.includes("安") && !n.includes("宁"))).toBeTruthy(); await page.locator("[name=avoidedChars]").fill("安");
  await page.locator(".naming-preferences > summary").click(); await page.locator("button[type=submit]").click(); await expect(page.locator("[name=requiredChars]")).toBeFocused(); await expect(page.locator("#formMessage")).toContainText("冲突"); expect(await page.locator("#cards h3").allTextContents()).toEqual(names);
});

test("未覆盖必用字返回空候选，修改入口直接定位", async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await openDetail(page, ".naming-constraints"); await page.locator("[name=requiredChars]").fill("龘"); await page.locator("button[type=submit]").click(); await expect(page.locator("#cards .empty-result")).toContainText("龘"); await expect(page.locator("#downloadReport")).toHaveCount(0);
  await page.getByRole("button", { name: "调整必用字或避讳", exact: true }).click(); await expect(page.locator("[name=requiredChars]")).toBeFocused();
});

test("单字必用只有一个结果，看完不循环", async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await openSettings(page); await page.locator("[name=length]").selectOption("1"); await openDetail(page, ".naming-constraints"); await page.locator("[name=requiredChars]").fill("安"); await page.locator("button[type=submit]").click(); await expect(page.locator("#cards .card")).toHaveCount(1); await expect(page.locator("#regenerate")).toBeDisabled();
});

test("五格严格筛选与未知笔画可以调整", async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await openDetail(page, ".naming-constraints"); await page.locator("[name=numerologyMode]").selectOption("strict");
  let response = page.waitForResponse("**/api/analyze"); await page.locator("button[type=submit]").click(); expect((await (await response).json()).candidates.every(x => !x.numerology)).toBeTruthy(); await expect(page.locator("#cards .card")).toHaveCount(3);
  await page.locator("[name=requiredChars]").fill("清"); await page.locator("button[type=submit]").click(); await expect(page.locator("#cards .empty-result")).toBeVisible();
  await page.getByRole("button", { name: "调整数理筛选", exact: true }).click(); await expect(page.locator("[name=numerologyMode]")).toBeFocused(); await page.locator("[name=numerologyMode]").selectOption("off"); await page.locator("button[type=submit]").click(); await expect(page.locator("#cards .card")).toHaveCount(3);
});

test("多音姓读法贯穿生成和报告", async ({ page }) => {
  await page.goto("/"); await fillInfo(page, { surname: "单" }); await openDetail(page, ".family-options"); await page.locator("[name=surnameReading]").fill("dān"); const response = page.waitForResponse("**/api/analyze"); await page.locator("button[type=submit]").click(); expect((await (await response).json()).candidates.every(x => x.pinyin.startsWith("dān "))).toBeTruthy(); await expect(page.locator("#cards .pinyin").first()).toContainText("dān");
});

for(const width of [1280,390]) test(`真太阳时选项参与请求但完整依据由后台交付 ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:950});await page.goto('/');await fillInfo(page,{scenario:'born',date:'2024-02-10',time:'23:05',place:'喀什'});
  await openDetail(page,'.time-settings');await page.locator('[name=timeBasis]').selectOption('apparent_solar');await expect(page.locator('[name=longitude]')).toHaveValue('75.99');
  const pending=page.waitForResponse('**/api/analyze');await page.locator('button[type=submit]').click();const response=await pending;
  expect(response.request().postDataJSON()).toMatchObject({timeBasis:'apparent_solar',longitude:'75.99',locationId:'kashgar'});expect((await response.json()).analysis).not.toHaveProperty('bazi');
  await expect(page.locator('#cards .card')).toHaveCount(3);await expect(page.locator('#summary .time-basis-note')).toHaveCount(0);
});

test("真太阳时缺失经度会展开定位，输入完整可继续", async ({ page }) => {
  await page.goto("/"); await fillInfo(page, { place: "未收录地点" }); await openDetail(page, ".time-settings"); await page.locator("[name=timeBasis]").selectOption("apparent_solar"); await page.locator(".naming-preferences > summary").click(); await page.locator("button[type=submit]").click(); await expect(page.locator("[name=longitude]")).toBeFocused(); await page.locator("[name=longitude]").fill("120.16"); await page.locator("button[type=submit]").click(); await expect(page.locator("#cards .card")).toHaveCount(3);
});

for (const scenario of ["due_date", "born", "rename"]) test(`民用时间不填城市也能完成${scenario}`, async ({ page }) => {
  await page.setViewportSize({width:390,height:950}); await page.goto("/");
  await fillInfo(page, {scenario, place:"", date:scenario === "due_date" ? "2099-12-23" : "2024-02-10"});
  await expect(page.locator("#placeHelp")).toContainText("可留空");
  if (scenario === "rename") {
    await page.locator("button[type=submit]").click(); await expect(page.locator("#formNameReview")).toBeVisible();
    await expect(page.locator("#formNameReview")).toContainText("现名分析已完成");
  }
  const pending=page.waitForRequest("**/api/analyze");
  if (scenario === "rename") await page.getByRole("button", {name:"查看改名提案",exact:true}).click();
  else await page.locator("button[type=submit]").click();
  const data=(await pending).postDataJSON(); expect(data.place).toBe(""); expect(data).not.toHaveProperty("longitude"); expect(data).not.toHaveProperty("locationId");
  await expect(page.locator("#cards .card")).toHaveCount(3); await expect(page.locator("#summary")).toContainText("免费提案");
  await expect(page.locator("#downloadReport")).toHaveCount(0);
});

test("城市只选一次，更换地点清除旧经度，手动0经度可用", async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await openDetail(page, ".time-settings"); await page.locator("[name=timeBasis]").selectOption("apparent_solar");
  await expect(page.locator("[name=longitude]")).toHaveValue("120.16");
  await page.locator("[name=longitude]").fill(""); await page.getByRole("button", {name:"恢复杭州城市中心经度",exact:true}).click(); await expect(page.locator("[name=longitude]")).toHaveValue("120.16");
  await page.locator("[name=longitude]").fill("120.15"); await page.locator("[name=place]").fill("杭州市"); await expect(page.locator("[name=longitude]")).toHaveValue("120.15");
  await page.locator("[name=place]").fill("成都"); await expect(page.locator("[name=longitude]")).toHaveValue("104.07");
  await page.locator("[name=place]").fill(""); await expect(page.locator("[name=longitude]")).toHaveValue(""); await expect(page.locator("[name=locationId]")).toHaveValue("");
  await page.locator("button[type=submit]").click(); await expect(page.locator("[name=longitude]")).toBeFocused();
  await page.locator("[name=longitude]").fill("0"); const pending=page.waitForResponse("**/api/analyze"); await page.locator("button[type=submit]").click();
  await expect(page.locator("#placeHelp")).toContainText("已填写手动经度0°E");
  const response=await pending;expect(response.request().postDataJSON().longitude).toBe("0");const value=await response.json();expect(value.analysis.access).toBe("proposal_only");
  await expect(page.locator("#cards .card")).toHaveCount(3); await expect(page.locator("#summary .time-basis-note")).toHaveCount(0);
});

test("真太阳时切回民用时间时不提交经度，重新启用仍保留调整", async ({ page }) => {
  await page.goto("/"); await fillInfo(page,{place:"臺北市"}); await openDetail(page,".time-settings"); await page.locator("[name=timeBasis]").selectOption("apparent_solar");
  await expect(page.locator("[name=longitude]")).toHaveValue("121.57"); await expect(page.locator("[name=zone]")).toHaveValue("Asia/Taipei");
  await page.locator("[name=longitude]").fill("121.56"); await page.locator("[name=timeBasis]").selectOption("civil");
  const pending=page.waitForRequest("**/api/analyze"); await page.locator("button[type=submit]").click(); const data=(await pending).postDataJSON(); expect(data).not.toHaveProperty("longitude"); expect(data).not.toHaveProperty("locationId");
  await expect(page.locator("#cards .card")).toHaveCount(3); await page.locator("[name=timeBasis]").selectOption("apparent_solar"); await expect(page.locator("[name=longitude]")).toHaveValue("121.56");
});

test("改名换城市后重新分析，并把同一修正依据用于推荐", async ({ page }) => {
  await page.goto("/"); await fillInfo(page,{scenario:"rename",currentName:"李明哲",date:"2024-02-10"}); await openDetail(page,".time-settings"); await page.locator("[name=timeBasis]").selectOption("apparent_solar");
  await page.locator("button[type=submit]").click(); await expect(page.locator("#formNameReview")).toBeVisible();
  await page.locator("[name=place]").fill("成都"); await expect(page.locator(".review-stale")).toBeVisible();
  const pending=page.waitForResponse("**/api/name-review"); await page.getByRole("button",{name:"重新分析现用姓名",exact:true}).click();
  const response=await pending;expect(response.request().postDataJSON()).toMatchObject({place:"成都",longitude:"104.07"});const review=await response.json();expect(review.analysis.review_completed).toBe(true);
  const recommendation=page.waitForResponse("**/api/analyze"); await page.getByRole("button",{name:"查看改名提案",exact:true}).click();
  const selected=await recommendation;expect(selected.request().postDataJSON()).toMatchObject({place:"成都",longitude:"104.07"});expect((await selected.json()).analysis).not.toHaveProperty("bazi");
});

for (const [status, body, text] of [[404, "missing", "未接通起名接口"], [502, "<html>bad gateway</html>", "暂时不可用"], [200, "<html>static page</html>", "无法识别"]]) test(`接口错误${status}-${text}可见并支持重试`, async ({ page }) => {
  await page.goto("/"); await fillInfo(page); await page.route("**/api/analyze", route => route.fulfill({ status, contentType: "text/html", body })); await page.locator("button[type=submit]").click(); await expect(page.locator("#formMessage")).toContainText(text); await expect(page.locator("#formMessage")).toBeInViewport(); await expect(page.locator("button[type=submit]")).toBeEnabled(); await expect(page.locator("#cards .card")).toHaveCount(0);
});

test("重复点击只提交一次，等待结束后可重试", async ({ page }) => {
  await page.goto("/"); await fillInfo(page); let count = 0; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const hold = async route => { count++; await gate; await route.continue(); }; await page.route("**/api/analyze", hold);
  await page.locator("button[type=submit]").click(); await expect(page.locator("button[type=submit]")).toBeDisabled(); await page.locator("button[type=submit]").evaluate(el => el.click()); expect(count).toBe(1); release(); await expect(page.locator("#cards .card")).toHaveCount(3);
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
  expect(await page.locator(".orb").evaluate(el => getComputedStyle(el, "::before").animationName)).toBe("none");
  expect(await page.locator('.celestial-glyph').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  expect(await page.locator('.celestial-stars').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
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
  await page.locator("button[type=submit]").click();
  await expect(page.locator("#formMessage")).toContainText("响应超时", { timeout: 20000 });
  await expect(page.locator("button[type=submit]")).toBeEnabled();
  await expect(page.locator("[name=dueDate]")).toHaveValue("2099-12-23");
  release(); await page.unroute("**/api/analyze", hold);
  await page.locator("button[type=submit]").click(); await expect(page.locator("#cards .card")).toHaveCount(3);
});

test("折叠偏好不丢设置，选城市带入对应时区", async ({ page }) => {
  await page.goto("/"); await fillInfo(page, { place: "台北" });
  await page.locator("[name=gender]").selectOption("female");
  await openSettings(page); await page.locator("[name=length]").selectOption("1"); await page.locator("[name=candidateCount]").fill("7");
  await page.locator("[name=likedChars]").fill("安"); await page.locator(".naming-preferences > summary").click();
  const pending = page.waitForRequest("**/api/analyze"); await page.locator("button[type=submit]").click();
  expect((await pending).postDataJSON()).toMatchObject({ gender: "female", length: "1", candidateCount: "7", likedChars: "安", zone: "Asia/Taipei" });
  await expect(page.locator("#cards .card")).toHaveCount(7);
});

test("表单资料不落本机收藏，离线仍能制作心愿卡", async ({ page, context }) => {
  await page.goto("/"); await generate(page); await page.locator("#cards .save").first().click();
  const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  expect(stored).not.toContain("2099-12-23"); expect(stored).not.toContain("dueDate"); expect(stored).not.toContain("birthDate");
  await page.evaluate(() => navigator.serviceWorker.ready); await context.setOffline(true); await page.reload();
  await page.locator("#keepsakeName").fill("林安");
  const pending = page.waitForEvent("download"); await page.locator("#downloadKeepsake").click(); const image = await readFile(await (await pending).path());
  expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
});

test("宝宝与改名对象的出生资料分别保留，不自动混填", async ({ page }) => {
  await page.goto("/"); await fillInfo(page, { scenario: "born", date: "2024-01-05", time: "12:00", place: "杭州" }); await page.locator("[name=gender]").selectOption("male");
  await selectScenario(page, "rename"); await page.locator("[name=currentName]").fill("李明哲");
  await expect(page.locator("[name=birthDate]")).toHaveValue(""); await expect(page.locator("[name=place]")).toHaveValue(""); await expect(page.locator("[name=gender]")).toHaveValue("unknown");
  await page.locator("[name=birthDate]").fill("1998-08-13"); await page.locator("[name=birthTime]").fill("13:48"); await page.locator("[name=place]").fill("台北");
  await selectScenario(page, "born"); await expect(page.locator("[name=birthDate]")).toHaveValue("2024-01-05"); await expect(page.locator("[name=place]")).toHaveValue("杭州"); await expect(page.locator("[name=gender]")).toHaveValue("male");
  await selectScenario(page, "rename"); await expect(page.locator("[name=birthDate]")).toHaveValue("1998-08-13"); await expect(page.locator("[name=zone]")).toHaveValue("Asia/Taipei");
});

test('完整报告须主动同意登记，咨询复制不附带出生资料',async({page})=>{
  await page.route('**/api/report-service',route=>route.fulfill({json:{available:true}}));
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copied=value;}}}));
  let input, calls=0;const id='11111111-1111-4111-8111-111111111111';
  await page.route('**/api/report-requests',async route=>{calls++;input=route.request().postDataJSON();await route.fulfill({json:{id,status:'new',reused:false}});});
  await page.goto('/');await generate(page);const section=page.locator('#reportRequest');
  const submit=section.getByRole('button',{name:'登记资料，获取申请编号'});await expect(submit).toBeDisabled();expect(calls).toBe(0);
  await section.getByRole('button',{name:'复制微信号'}).click();expect(await page.evaluate(()=>window.__copied)).toBe('LCEX511');
  await section.getByRole('checkbox').check();await submit.click();await expect(section.locator('code')).toHaveText(id);expect(calls).toBe(1);
  expect(input.consent).toBe(true);expect(input.input.dueDate).toBe('2099-12-23');expect(input.expected_names).toEqual(await page.locator('#cards h3').allTextContents());expect(input).not.toHaveProperty('analysis');expect(input).not.toHaveProperty('report');
  await section.getByRole('button',{name:'复制申请编号与名字'}).click();const copied=await page.evaluate(()=>window.__copied);expect(copied).toContain(id);expect(copied).not.toContain('2099');expect(copied).not.toContain('dueDate');
});

test('登记失败可重试并复用编号，修改偏好后须应用才可登记',async({page})=>{
  await page.route('**/api/report-service',route=>route.fulfill({json:{available:true}}));const inputs=[];
  await page.route('**/api/report-requests',async route=>{inputs.push(route.request().postDataJSON());await route.fulfill(inputs.length===1?{status:503,json:{error:'登记暂时不可用'}}:{json:{id:'22222222-2222-4222-8222-222222222222'}});});
  await page.goto('/');await generate(page);const section=page.locator('#reportRequest');await section.getByRole('checkbox').check();await section.getByRole('button',{name:'登记资料，获取申请编号'}).click();await expect(section.getByRole('alert')).toContainText('登记暂时不可用');
  await section.getByRole('button',{name:'登记资料，获取申请编号'}).click();await expect(section.locator('code')).toBeVisible();expect(inputs[0].request_key).toBe(inputs[1].request_key);
  await page.getByRole('button',{name:'调整偏好',exact:true}).click();await page.locator('[name=likedChars]').fill('安');await expect(section.getByRole('checkbox')).toHaveCount(0);await expect(section.locator('code')).toHaveCount(0);
  await page.getByRole('button',{name:'应用修改并生成',exact:true}).click();await expect(page.locator('.draft-notice')).toHaveCount(0);await expect(section.getByRole('checkbox')).toBeVisible();await expect(section.getByRole('checkbox')).not.toBeChecked();
});
