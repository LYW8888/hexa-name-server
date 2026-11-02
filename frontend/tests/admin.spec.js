import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
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

test('客户只看提案，经营者凭编号导出完整报告并人工交付',async({page,browser})=>{
  test.setTimeout(60000);
  const other=await browser.newContext({viewport:{width:390,height:950}});const client=await other.newPage();
  await login(page,'reports');
  await client.goto('http://127.0.0.1:4196/');
  await client.locator('[name=scenario][value=born]').locator('..').click();
  await client.locator('[name=surname]').fill('林');await client.locator('[name=birthDate]').fill('2024-04-10');await client.locator('[name=birthTime]').fill('12:00');await client.locator('[name=place]').fill('杭州');
  await client.locator('.naming-preferences > summary').click();await client.locator('.time-settings > summary').click();await client.locator('[name=timeBasis]').selectOption('apparent_solar');
  const generated=client.waitForResponse('**/api/analyze');await client.locator('#namingForm button[type=submit]').click();
  const proposal=await(await generated).json();expect(proposal.analysis).not.toHaveProperty('bazi');await expect(client.locator('#cards .card')).toHaveCount(3);
  expect((await(await page.request.get('/api/reports')).json()).requests).toHaveLength(0);
  const section=client.getByRole('region',{name:'联系获取完整报告'});const submit=section.getByRole('button',{name:'登记资料，获取申请编号'});
  await expect(submit).toBeDisabled();await section.getByRole('checkbox').check();
  const created=client.waitForResponse('**/api/report-requests');await submit.click();const receipt=await(await created).json();
  await expect(section.locator('code')).toHaveText(receipt.id);expect((await client.request.get('http://127.0.0.1:4196/api/reports/'+receipt.id)).status()).toBe(404);
  await page.setViewportSize({width:390,height:950});await page.getByRole('button',{name:'完整报告',exact:true}).click();
  await page.locator('[name=reportQuery]').fill(receipt.id);await page.getByRole('button',{name:'查找申请',exact:true}).click();
  await page.getByRole('button',{name:'查看完整报告',exact:true}).click();const workspace=page.getByRole('region',{name:'经营者完整报告'});
  await expect(workspace).toContainText('真太阳时');await expect(workspace.locator('.report-preview')).toContainText('四柱阴阳五行与生克关系');
  if(process.env.XUMING_CAPTURE_REPORTS==='1') {
    await client.locator('#cards').screenshot({path:'../reports/images/free-proposals-mobile.png',style:'.site-header{visibility:hidden!important}'});
    await section.screenshot({path:'../reports/images/report-contact-mobile.png',style:'.site-header{visibility:hidden!important}'});
    await page.setViewportSize({width:1280,height:950});
    await workspace.screenshot({path:'../reports/images/operator-report-desktop.png'});
    await page.setViewportSize({width:390,height:950});
  }
  let pending=page.waitForEvent('download');await workspace.getByRole('button',{name:'导出完整报告'}).click();
  const {readFile}=await import('node:fs/promises');const file=await pending;expect(file.suggestedFilename()).toContain(receipt.id);let text=await readFile(await file.path(),'utf8');expect(text).toContain(`申请编号：${receipt.id}`);
  for(const value of ['实际出生信息：2024-04-10 12:00','真太阳钟','城市中心近似经度（杭州）','古籍','文件SHA-256'])expect(text).toContain(value);
  for(const item of proposal.candidates)expect(text).toContain(item.name);
  await workspace.getByRole('button',{name:'标记已交付',exact:true}).click();await workspace.getByRole('button',{name:'确认已通过微信或QQ交付',exact:true}).click();await expect(workspace.getByRole('button',{name:'已人工交付',exact:true})).toBeDisabled();
  expect((await(await page.request.get('/api/reports/'+receipt.id)).json()).status).toBe('delivered');
  // Rename still analyses the original name first; only the operator receives that report.
  await client.locator('[name=scenario][value=rename]').locator('..').click();await client.locator('[name=currentName]').fill('欧阳明哲');await client.locator('[name=birthDate]').fill('1998-08-13');await client.locator('[name=birthTime]').fill('13:48');await client.locator('[name=place]').fill('台北');
  await client.getByRole('button',{name:'分析现用姓名',exact:true}).click();await expect(client.locator('#formNameReview')).toContainText('现名分析已完成');await client.getByRole('button',{name:'查看改名提案',exact:true}).click();await expect(client.locator('#cards .card')).toHaveCount(3);
  await section.getByRole('checkbox').check();const renamed=client.waitForResponse('**/api/report-requests');await section.getByRole('button',{name:'登记资料，获取申请编号'}).click();const second=await(await renamed).json();
  await page.locator('[name=reportQuery]').fill(`序名完整报告申请 申请编号：${second.id} 名字提案：欧阳`);await page.getByRole('button',{name:'查找申请',exact:true}).click();await page.getByRole('button',{name:'查看完整报告',exact:true}).click();
  pending=page.waitForEvent('download');await workspace.getByRole('button',{name:'导出完整报告'}).click();text=await readFile(await(await pending).path(),'utf8');
  expect(text).toContain('现用姓名：欧阳明哲');expect(text.indexOf('## 现用姓名分析')).toBeLessThan(text.indexOf('## 改名候选'));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.getByRole('button',{name:'退出登录'}).click();expect((await page.request.get('/api/reports/'+second.id)).status()).toBe(401);
  await other.close();
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
  if(process.env.XUMING_CAPTURE_REPORTS==='1') {
    await page.setViewportSize({width:1440,height:950});await page.screenshot({path:'../reports/images/modern-admin-login-desktop.png'});
    await page.setViewportSize({width:390,height:950});await page.screenshot({path:'../reports/images/modern-admin-login-mobile.png'});
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
  if(process.env.XUMING_CAPTURE_REPORTS==='1'){await page.setViewportSize({width:1440,height:950});await page.screenshot({path:'../reports/images/modern-admin-overview.png'});}
  await page.getByRole('button',{name:'员工与权限',exact:true}).click();const rootRow=page.getByRole('row').filter({hasText:bundle.username});await expect(rootRow.getByRole('button',{name:'停用',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'退出登录',exact:true}).click();expect((await page.request.get('/api/reports')).status()).toBe(401);expect(errors).toEqual([]);
});
