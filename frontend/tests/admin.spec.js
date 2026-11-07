import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import {basic,birth,preferences,submitNaming} from "./wizard.js";
function token(secretKey=Buffer.from("00112233445566778899aabbccddeeff00112233", "hex")) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac(
    "sha1",
    secretKey,
  )
    .update(counter)
    .digest();
  const at = hash[19] & 15;
  return String((hash.readUInt32BE(at) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
async function login(page, role) {
  await page.goto("/");
  await page.locator("[name=username]").fill(`${role}_browser`);
  await page.locator("[name=password]").fill("Browser-Test-Only-482!");
  await page.locator("[name=token]").fill(token());
  await page.getByRole("button", { name: "安全登录" }).click();
  await expect(page.getByRole("heading", { name: "工作总览" })).toBeVisible();
}
async function captureWorkbench(page,path){
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path,fullPage:true,animations:'disabled',style:'.toast{visibility:hidden!important}.site-header{position:relative!important;top:auto!important}'});
}
async function rawPost(page, path, data) {
  return page.evaluate(
    async ({ path, data }) => {
      const session = await (await fetch("/api/session")).json();
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": session.csrf,
        },
        body: JSON.stringify(data),
      });
      return { status: response.status, body: await response.json() };
    },
    { path, data },
  );
}
test("经营者登录、汇总、员工开通及岗位数据隔离", async ({ page }) => {
  await login(page, "owner");
  await expect(page.locator(".metric-card")).toHaveCount(3);
  await expect(page.locator(".metric-card")).toContainText([
    "岗位已连接",
    "岗位已连接",
    "岗位已连接",
  ]);
  expect((await page.request.get("/api/ops/finance/list")).status()).toBe(403);
  await page.getByRole("button",{name:"报告与体验",exact:true}).click();await expect(page.getByRole("region",{name:"免费体验名额设置"})).toBeVisible();
  await page.getByRole("button", { name: "员工与权限" }).click();
  await page.locator("[name=username]").fill("new_browser_staff");
  await page.locator("[name=password]").fill("New-Staff-Initial-593!");
  await page.getByRole("button", { name: "创建独立账号" }).click();
  await expect(page.locator(".enrollment")).toContainText("new_browser_staff");
  await expect(
    page.getByRole("cell", { name: "new_browser_staff", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "已妥善交付，关闭显示" }).click();
  await expect(page.locator(".enrollment")).toHaveCount(0);
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByRole("button", { name: "安全登录" })).toBeVisible();
  expect((await page.request.get("/api/staff")).status()).toBe(401);
});
test("客服工单创建和流转，手机端可用且不能访问财务", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "support");
  expect((await page.request.get("/api/ops/finance/list")).status()).toBe(403);
  await page.getByRole("button", { name: "客服工作台" }).click();
  await page.locator("[name=category]").selectOption("delivery");
  await page.getByRole("button", { name: "提交登记" }).click();
  await expect(
    page.getByRole("cell").filter({ hasText: "交付问题" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "处理中", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("处理中");
  await page.getByRole("button", { name: "已解决", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("已解决");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBeTruthy();
});
test("财务手工登记与一次冲销，不开放退款", async ({ page }) => {
  await login(page, "finance");
  await page.getByRole("button", { name: "财务工作台" }).click();
  await page.locator("[name=amount]").fill("99.50");
  await page.getByRole("button", { name: "提交登记" }).click();
  await expect(page.locator("tbody")).toContainText("99.50");
  await expect(page.locator("[name=kind] option")).toHaveCount(2);
  await page.getByRole("button", { name: "冲销", exact: true }).click();
  await page.getByRole("button", { name: "确认冲销", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  expect(
    (
      await rawPost(page, "/api/ops/finance/record", {
        kind: "refund",
        amount_fen: 100,
        request_key: randomUUID(),
      })
    ).status,
  ).toBe(409);
  expect((await page.request.get("/api/ops/support/list")).status()).toBe(403);
});
test("交付从授权登记到完成，重复请求复用原服务", async ({ page }) => {
  await login(page, "delivery");
  await page.getByRole("button", { name: "交付工作台" }).click();
  const request = {
    request_key: randomUUID(),
    authorization_ref: randomUUID(),
    spec_sha256: "a".repeat(64),
  };
  await page.locator("[name=request_key]").fill(request.request_key);
  await page
    .locator("[name=authorization_ref]")
    .fill(request.authorization_ref);
  await page.locator("[name=spec_sha256]").fill(request.spec_sha256);
  await page.getByRole("button", { name: "提交登记" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "开始执行" }).click();
  await page.getByLabel("报告 SHA-256").fill("b".repeat(64));
  await page.getByRole("button", { name: "登记完成" }).click();
  await expect(page.locator("tbody")).toContainText("已交付");
  expect(
    (await rawPost(page, "/api/ops/delivery/create", request)).body.result
      .reused,
  ).toBeTruthy();
  await page.getByRole("button", { name: "刷新数据" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "开始执行" })).toHaveCount(0);
});

test('后台名额设置与最后一份并发争抢，响应丢失可恢复',async({page,browser})=>{
  test.setTimeout(90000);await login(page,'reports');await page.getByRole('button',{name:'体验反馈与内测',exact:true}).click();
  if(process.env.XUMING_CAPTURE_EXPERIENCE==='1')await page.getByRole('region',{name:'免费体验名额设置'}).screenshot({path:'../reports/images/public-quota-admin.png'});
  const start=await(await page.request.get('/api/experience')).json();
  await page.locator('[name=quotaTotal]').fill(String(start.quota.used+1));const saved=page.waitForResponse('**/api/experience/quota');await page.getByRole('button',{name:'保存名额设置'}).click();expect((await saved).status()).toBe(200);
  const contexts=await Promise.all([browser.newContext(),browser.newContext()]);const clients=await Promise.all(contexts.map(c=>c.newPage()));
  const identities=await Promise.all(clients.map(async(client,i)=>{
    await client.goto('http://127.0.0.1:4196/');await basic(client); await client.locator('[name=surname]').fill(i?'李':'林');await birth(client); await client.locator('[name=dueDate]').fill('2099-09-09');
    const pending=client.waitForResponse('**/api/analyze');await submitNaming(client);return(await(await pending).json()).experience;
  }));
  let release;const gate=new Promise(r=>release=r);let arrived=0;
  for(const client of clients)await client.route('**/api/beta-reports',async route=>{if(++arrived===2)release();await gate;const response=await route.fetch();if(response.ok())await route.fulfill({status:503,json:{error:'响应丢失，请重试确认'}});else await route.fulfill({response});});
  const responses=clients.map(c=>c.waitForResponse('**/api/beta-reports'));
  await Promise.all(clients.map(c=>c.getByRole('button',{name:'查看完整报告（内测）',exact:true}).click()));await Promise.all(responses);
  const after=await(await page.request.get('/api/experience')).json();expect(after.quota.used).toBe(start.quota.used+1);expect(after.quota.remaining).toBe(0);
  const reads=await Promise.all(clients.map((c,i)=>c.request.post('http://127.0.0.1:4196/api/beta-reports/read',{data:{generation_id:identities[i].generation_id,generation_token:identities[i].generation_token}})));expect(reads.map(r=>r.status()).sort()).toEqual([200,404]);
  const winner=clients[reads.findIndex(r=>r.ok())];await winner.getByRole('dialog').getByRole('button',{name:'重试查看本份报告'}).click();await expect(winner.getByRole('region',{name:'内测完整报告',exact:true})).toBeVisible();
  const end=await(await page.request.get('/api/experience')).json();expect(end.quota.used).toBe(after.quota.used);
  const conflict=await rawPost(page,'/api/experience/quota',{total:end.quota.total+1,enabled:true,expected_config_version:start.quota.config_version});expect(conflict.status).toBe(409);
  expect((await rawPost(page,'/api/experience/quota',{total:end.quota.used+100,enabled:true,expected_config_version:end.quota.config_version})).status).toBe(200);
  await Promise.all(contexts.map(c=>c.close()));
});

for(const width of [1280,390])test(`内测先看完整报告再自愿低分反馈，后台可处理 ${width}px`,async({page,browser})=>{
  test.setTimeout(90000);
  await page.setViewportSize({width,height:950});await login(page,width===1280?'experience_desktop':'experience_mobile');
  await page.getByRole('button',{name:'体验反馈与内测',exact:true}).click();
  const context=await browser.newContext({viewport:{width,height:950}}),client=await context.newPage();
  const errors=[];client.on('pageerror',e=>errors.push(e.message));
  await client.goto('http://127.0.0.1:4196/');
  if(width===390){
    await client.locator('[name=scenario][value=rename]').locator('..').click();await basic(client); await client.locator('[name=currentName]').fill('欧阳明哲');
    await birth(client); await client.locator('[name=birthDate]').fill('1998-08-13');await birth(client); await client.locator('[name=birthTime]').fill('13:48');
    await preferences(client);await client.getByRole('button',{name:'分析现用姓名',exact:true}).click();await expect(client.locator('#currentReviewTitle')).toBeVisible();
  }else{
    await basic(client); await client.locator('[name=surname]').fill('林');await birth(client); await client.locator('[name=dueDate]').fill('2099-12-23');
  }
  if(process.env.XUMING_CAPTURE_EXPERIENCE==='1')await captureWorkbench(client,`../reports/images/public-workbench-${width}.png`);
  const generated=client.waitForResponse('**/api/analyze');
  await preferences(client);await client.getByRole('button',{name:width===390?'查看改名提案':'生成名字提案 ✦',exact:true}).click();
  const proposal=await(await generated).json();expect(proposal.experience.available).toBe(true);expect(proposal.analysis).not.toHaveProperty('bazi');
  await expect(client.locator('#results')).toBeFocused();
  const freeBefore=await(await page.request.get('/api/experience')).json();
  await client.locator('#cards .name-detail-entry').first().click();
  await expect(client.getByRole('dialog')).toContainText('出处，写清每一处来由');
  await client.getByRole('button',{name:'关闭名字详情',exact:true}).click();
  const freeAfter=await(await page.request.get('/api/experience')).json();expect(freeAfter.quota.used).toBe(freeBefore.quota.used);
  await expect(client.locator('#cards .name-detail-entry').first()).toBeFocused();
  let claims=0;client.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/beta-reports')claims++;});
  await client.getByRole('link',{name:'报告与反馈',exact:true}).click();
  await expect(client.locator('#experienceReport')).toBeFocused();
  await expect(client.getByRole('button',{name:'查看完整报告（内测）',exact:true})).toBeInViewport();
  expect(claims).toBe(0);
  if(process.env.XUMING_CAPTURE_EXPERIENCE==='1')await captureWorkbench(client,`../reports/images/public-proposals-${width}.png`);
  const betaResponse=client.waitForResponse('**/api/beta-reports');await client.getByRole('button',{name:'查看完整报告（内测）',exact:true}).click();const beta=await(await betaResponse).json();
  const dialog=client.getByRole('dialog');
  await expect(client.getByRole('region',{name:'内测完整报告',exact:true})).toBeVisible();await expect(dialog).toContainText('出生四柱与五行');await expect(dialog).toContainText('格局 · 旺衰 · 喜用参考');
  if(width===390)await expect(dialog.getByRole('region',{name:'现用姓名分析报告'})).toContainText('欧阳明哲');
  const before=await(await page.request.get('/api/experience')).json();expect(before.feedback.some(x=>x.generation_id===proposal.experience.generation_id)).toBe(false);
  if(process.env.XUMING_CAPTURE_EXPERIENCE==='1'){
    await client.screenshot({path:`../reports/images/beta-report-${width===390?'mobile':'desktop'}.png`});
    if(width===390){await dialog.getByRole('heading',{name:'出生四柱与五行',exact:true}).scrollIntoViewIfNeeded();await client.screenshot({path:'../reports/images/beta-pillars-mobile.png'});}
  }
  expect((await betaResponse).headers()['cache-control']).toContain('no-store');
  const stored=await client.evaluate(()=>JSON.stringify(Object.entries(localStorage)));expect(stored).not.toContain('birthDate');expect(stored).not.toContain(proposal.experience.generation_token);expect(stored).not.toContain(proposal.experience.generation_id);
  await dialog.getByRole('button',{name:'暂不反馈，继续使用',exact:true}).click();
  await client.getByRole('button',{name:'查看完整报告（内测）',exact:true}).click();await expect(client.getByRole('region',{name:'内测完整报告',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'自愿反馈报告体验',exact:true}).click();await expect(dialog).toContainText('评价范围：完整内测报告');
  await dialog.getByRole('button',{name:'提交体验反馈',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('请选择');
  await dialog.locator('[name=experienceRating][value="1"]').locator('..').click();await dialog.getByRole('checkbox',{name:'报告阅读',exact:true}).check();
  const comment=width===390?'手机端报告段落太长，希望增加摘要。':'依据解释有点难懂，希望更直白。';
  await dialog.locator('[name=experienceComment]').fill(comment);
  if(process.env.XUMING_CAPTURE_EXPERIENCE==='1'&&width===390)await client.screenshot({path:'../reports/images/experience-feedback-mobile.png'});
  const sent=[];
  await client.route('**/api/experience-feedback',async route=>{sent.push(route.request().postDataJSON());if(sent.length===1)await route.fulfill({status:503,json:{error:'临时失败，请重试'}});else await route.continue();});
  await dialog.getByRole('button',{name:'提交体验反馈',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('临时失败');
  await expect(dialog.locator('[name=experienceComment]')).toHaveValue(comment);
  await dialog.getByRole('button',{name:'提交体验反馈',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('反馈已提交');expect(sent[0].request_key).toBe(sent[1].request_key);
  await dialog.getByRole('button',{name:'继续使用',exact:true}).click();
  await page.getByRole('button',{name:'刷新体验记录',exact:true}).click();const item=page.locator('.experience-feedback-item').filter({hasText:comment});
  await expect(item).toContainText('1/5 · 完整内测报告');await item.getByRole('button',{name:'纳入改进',exact:true}).click();await expect(item.locator('.experience-feedback-heading')).toContainText('纳入改进');
  await item.getByRole('button',{name:'标记已处理',exact:true}).click();await expect(item.locator('.experience-feedback-heading')).toContainText('已处理');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出当前反馈JSON',exact:true}).click();const file=await download;const {readFile}=await import('node:fs/promises');const exported=JSON.parse(await readFile(await file.path(),'utf8'));expect(exported.feedback.some(x=>x.comment===comment&&x.rating===1)).toBe(true);expect(JSON.stringify(exported)).not.toContain('birthDate');
  await item.getByRole('button',{name:'查看关联内测报告',exact:true}).click();await expect(page.getByRole('region',{name:'经营者内测完整报告'})).toContainText('四柱阴阳五行与生克关系');
  if(process.env.XUMING_CAPTURE_EXPERIENCE==='1'&&width===390){await page.setViewportSize({width:1440,height:1050});await page.screenshot({path:'../reports/images/experience-admin-desktop.png'});}
  const reportId=beta.id;expect((await client.request.post('http://127.0.0.1:4196/api/beta-reports/read',{data:{generation_id:proposal.experience.generation_id,generation_token:'forged'}})).status()).toBe(404);
  expect((await page.request.get('/api/experience/reports/'+reportId)).status()).toBe(200);
  const current=await(await page.request.get('/api/experience')).json();const used=current.quota.used;
  expect((await rawPost(page,'/api/experience/quota',{total:current.quota.total,enabled:false,expected_config_version:current.quota.config_version})).status).toBe(200);
  await client.getByRole('button',{name:'查看完整报告（内测）',exact:true}).click();await expect(client.getByRole('region',{name:'内测完整报告',exact:true})).toBeVisible();
  const paused=await(await page.request.get('/api/experience')).json();expect(paused.quota.used).toBe(used);
  expect((await rawPost(page,'/api/experience/quota',{total:paused.quota.total,enabled:true,expected_config_version:paused.quota.config_version})).status).toBe(200);
  expect(await client.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  await context.close();
});

test('普通提案也能低分反馈，提交反馈不会解锁报告',async({page,browser})=>{
  test.setTimeout(60000);await login(page,'experience_proposal');
  const context=await browser.newContext({viewport:{width:390,height:950}}),client=await context.newPage();await client.goto('http://127.0.0.1:4196/');
  await basic(client); await client.locator('[name=surname]').fill('李');await birth(client); await client.locator('[name=dueDate]').fill('2099-06-18');const pending=client.waitForResponse('**/api/analyze');await submitNaming(client);const proposal=await(await pending).json();
  await client.getByRole('button',{name:'反馈本次体验',exact:true}).click();const dialog=client.getByRole('dialog');await expect(dialog).toContainText('评价范围：免费名字提案');
  await dialog.locator('[name=experienceRating][value="2"]').locator('..').click();await dialog.locator('[name=experienceComment]').fill('想要更容易比较名字。');await dialog.getByRole('button',{name:'提交体验反馈',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('反馈已提交');
  expect((await client.request.post('http://127.0.0.1:4196/api/beta-reports/read',{data:{generation_id:proposal.experience.generation_id,generation_token:proposal.experience.generation_token}})).status()).toBe(404);
  const value=await(await page.request.get('/api/experience?stage=proposal')).json();expect(value.feedback.some(x=>x.rating===2&&x.comment==='想要更容易比较名字。')).toBe(true);
  await dialog.getByRole('button',{name:'继续使用',exact:true}).click();
  await client.getByRole('button',{name:'查看完整报告（内测）',exact:true}).click();await expect(client.getByRole('region',{name:'内测完整报告',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'自愿反馈报告体验',exact:true}).click();await expect(dialog.locator('[name=experienceRating]:checked')).toHaveCount(0);await expect(dialog.locator('[name=experienceComment]')).toHaveValue('');
  await context.close();
});

test('延迟名额响应与切换提案不覆盖新状态，等待窗口可关闭',async({page,browser})=>{
  test.setTimeout(60000);await login(page,'experience_async');
  const context=await browser.newContext(),client=await context.newPage();await client.goto('http://127.0.0.1:4196/');
  await expect(client.locator('[data-quota=remaining]')).not.toHaveText('—');
  await basic(client); await client.locator('[name=surname]').fill('林');await birth(client); await client.locator('[name=dueDate]').fill('2099-01-01');await submitNaming(client);await expect(client.locator('#cards .card')).toHaveCount(10);
  let releaseQuota,quotaStarted,releaseClaim,claimStarted;
  const quotaGate=new Promise(r=>releaseQuota=r),quotaReady=new Promise(r=>quotaStarted=r),claimGate=new Promise(r=>releaseClaim=r),claimReady=new Promise(r=>claimStarted=r);
  let held=false;
  await client.route('**/api/beta-quota',async route=>{if(held)return route.continue();held=true;const old=await route.fetch();quotaStarted();await quotaGate;await route.fulfill({response:old}).catch(()=>{});});
  await client.getByRole('button',{name:'刷新体验名额'}).click();await quotaReady;
  let saved;
  await client.route('**/api/beta-reports',async route=>{const response=await route.fetch();saved=await response.json();claimStarted();await claimGate;await route.fulfill({response});});
  await client.getByRole('button',{name:'查看完整报告（内测）',exact:true}).click();await claimReady;
  await client.getByRole('button',{name:'关闭体验窗口'}).click();
  await basic(client); await client.locator('[name=surname]').fill('李');await submitNaming(client);await expect(client.locator('#summary')).toContainText('李');await expect(client.locator('#cards .card')).toHaveCount(10);
  releaseClaim();await expect(client.locator('[data-quota=used]')).toHaveText(String(saved.quota.used));releaseQuota();
  await expect(client.getByRole('region',{name:'内测完整报告',exact:true})).toHaveCount(0);await expect(client.locator('#summary')).toContainText('李');
  await expect(client.locator('[data-quota=used]')).toHaveText(String(saved.quota.used));
  const latest=await(await page.request.get('/api/experience')).json();expect(latest.quota.used).toBe(saved.quota.used);
  await context.close();
});

function base32(secret) {
  let bits=0,value=0;const bytes=[];
  for(const char of secret.replace(/=+$/,'')){value=(value<<5)|'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char.toUpperCase());bits+=5;if(bits>=8){bits-=8;bytes.push((value>>>bits)&255);}}
  return Buffer.from(bytes);
}
test('随机超级管理员首次登录、密码确认及初始化凭据清理',async({page})=>{
  test.setTimeout(60000);
  const {readFile,stat}=await import('node:fs/promises');const {join}=await import('node:path');
  const bundle=JSON.parse(await readFile(join(process.env.XUMING_ADMIN_TEST_HANDOFF,'superadmin.json'),'utf8'));
  expect(bundle.username).toMatch(/^sa_[0-9a-f]{16}$/);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'登录经营工作台',exact:true})).toBeVisible();
  if(process.env.XUMING_CAPTURE_REPORTS==='1') {
    await page.setViewportSize({width:1440,height:950});await page.screenshot({path:'../reports/images/celestial-admin-login-desktop.png'});
    await page.setViewportSize({width:390,height:950});await page.screenshot({path:'../reports/images/celestial-admin-login-mobile.png'});
  }
  await page.locator('[name=username]').fill(bundle.username);await page.locator('[name=password]').fill(bundle.password);
  await page.getByRole('button',{name:'显示密码',exact:true}).click();await expect(page.locator('[name=password]')).toHaveAttribute('type','text');
  await page.getByRole('button',{name:'隐藏密码',exact:true}).click();await expect(page.locator('[name=password]')).toHaveAttribute('type','password');
  const secret=base32(new URL(bundle.totp_uri).searchParams.get('secret'));await page.locator('[name=token]').fill(token(secret));await page.getByRole('button',{name:'安全登录',exact:false}).click();
  await expect(page.getByRole('heading',{name:'设置你的独立密码'})).toBeVisible();expect((await page.request.get('/api/reports')).status()).toBe(403);
  await page.locator('[name=current_password]').fill(bundle.password);await page.locator('[name=new_password]').fill('Private-New-Owner-Password-582!');await page.locator('[name=confirm_password]').fill('Private-Different-Password-481!');
  await page.getByRole('button',{name:'更新密码',exact:true}).click();await expect(page.getByRole('status')).toContainText('两次新密码不一致');
  await page.locator('[name=confirm_password]').fill('Private-New-Owner-Password-582!');await page.getByRole('button',{name:'更新密码',exact:true}).click();
  await expect(page.getByRole('heading',{name:'工作总览',exact:true})).toBeVisible();await expect(page.locator('.identity')).toContainText('超级管理员');
  await expect.poll(async()=>{try{await stat(bundle.initial_file);return true;}catch{return false;}}).toBe(false);
  const session=await(await page.request.get('/api/session')).json();expect(session.user.is_superadmin).toBe(true);expect(session.user.must_change_password).toBe(false);
  expect((await page.request.get('/api/ops/finance/list')).status()).toBe(403);expect((await page.request.get('/initial-superadmin.json')).status()).toBe(404);
  if(process.env.XUMING_CAPTURE_REPORTS==='1'){await page.setViewportSize({width:1440,height:950});await page.screenshot({path:'../reports/images/celestial-admin-overview.png'});}
  await page.getByRole('button',{name:'员工与权限',exact:true}).click();const rootRow=page.getByRole('row').filter({hasText:bundle.username});await expect(rootRow.getByRole('button',{name:'停用',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'退出登录',exact:true}).click();expect((await page.request.get('/api/reports')).status()).toBe(401);expect(errors).toEqual([]);
});
