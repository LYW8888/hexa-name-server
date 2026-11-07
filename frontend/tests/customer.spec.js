import { test, expect } from "@playwright/test";
import {basic,birth,preferences} from "./wizard.js";
async function generate(page) {
  await page.locator("[name=surname]").fill("林");
  await birth(page);
  await page.locator("[name=dueDate]").fill("2099-01-01");
  await page.locator("[name=place]").fill("杭州");
  await page.locator(".time-settings > summary").click();
  await page.locator("[name=timeBasis]").selectOption("apparent_solar");
  await expect(page.locator("[name=longitude]")).toHaveValue("120.16");
  await preferences(page);
  await page.locator(".naming-constraints > summary").click();
  await page.locator("[name=elementPreference]").selectOption("水");
  await page
    .locator("button[type=submit]")
    .filter({ hasText: "生成名字提案" })
    .click();
  await expect(page.locator("#cards .card")).toHaveCount(10);
}
async function login(page, phone) {
  const account = page.getByRole("region", { name: "我的服务" });
  await account.locator("[name=customerPhone]").fill(phone);
  await account.getByRole("button", { name: "获取验证码" }).click();
  await expect(account.locator("[name=customerCode]")).toBeVisible();
  await account.locator("[name=customerCode]").fill("604921");
  await account.getByRole("button", { name: "验证码登录" }).click();
  await expect(account.getByRole("button", { name: "退出账号" })).toBeVisible();
  return account;
}
test("免费提案免登录，主动保存后只找回提案，可删除", async ({ page }) => {
  await page.goto("/");await page.locator("#accountTools > summary").click();
  await generate(page);
  expect((await page.request.get("/api/customer/records")).status()).toBe(401);
  const account = await login(page, "13800008000");
  const save = account.getByRole("button", { name: "保存当前体验方案" });
  await expect(save).toBeDisabled();
  await account
    .getByRole("checkbox", { name: "我确认保存本次信息与体验方案。" })
    .check();
  await save.click();
  await expect(account.locator(".customer-records li")).toHaveCount(1);
  await save.click();
  await expect(account.locator(".customer-records li")).toHaveCount(1);
  const publicRequest = page.waitForRequest("**/api/name-counts*");
  await page.reload();await page.locator("#accountTools > summary").click();
  expect((await (await publicRequest).allHeaders()).cookie || "").not.toContain(
    "xuming_customer",
  );
  await expect(account.getByRole("button", { name: "退出账号" })).toBeVisible();
  await expect(account.locator(".customer-records li")).toHaveCount(1);
  const pending = page.waitForResponse(r=>r.url().includes('/api/customer/records/')&&!r.url().endsWith('/save'));
  await account.getByRole('button',{name:'查看名字提案'}).click();
  const value=await(await pending).json();expect(value.report.analysis.access).toBe('proposal_only');expect(value.report.analysis).not.toHaveProperty('bazi');
  await expect(account.getByRole('region',{name:'账号名字提案'})).toContainText('重新生成并体验完整报告');
  const savedNames=account.getByRole('region',{name:'账号名字提案'});
  await savedNames.locator('article').first().getByText('查看名字详情与出处',{exact:true}).click();
  await expect(savedNames.locator('article').first()).toContainText('怎样契合本次出生信息');
  await expect(savedNames.locator('article').first()).toContainText('相生相克，具体怎么理解');
  await expect(page.locator('#downloadReport')).toHaveCount(0);
  await account.getByRole("button", { name: "删除", exact: true }).click();
  await account.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(account.locator(".customer-records li")).toHaveCount(0);
  await account.getByRole("button", { name: "退出账号" }).click();
  expect((await page.request.get("/api/customer/records")).status()).toBe(401);
});
test("其他客户无法取得报告，手机端不溢出", async ({ page, browser }) => {
  await page.goto("/");await page.locator("#accountTools > summary").click();
  await generate(page);
  const account = await login(page, "13900008000");
  await account.getByRole("checkbox").check();
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/api/customer/records/save"),
  );
  await account.getByRole("button", { name: "保存当前体验方案" }).click();
  const id = (await (await response).json()).record.id;
  const other = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const mobile = await other.newPage();
  await mobile.goto("/#account");
  const second = await login(mobile, "13700008000");
  await expect(second.locator(".customer-records li")).toHaveCount(0);
  expect(
    (await mobile.request.get(`/api/customer/records/${id}`)).status(),
  ).toBe(404);
  expect((await mobile.request.get("/api/staff")).status()).toBe(404);
  expect(
    await mobile.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBeTruthy();
  await other.close();
});
test("短信未开通时保持免登录免费流程", async ({ page }) => {
  await page.route("**/api/customer/session", (route) =>
    route.fulfill({
      json: {
        customer: null,
        sms_available: false,
        retention_days: 30,
        record_limit: 20,
        purchases_available: false,
      },
    }),
  );
  await page.goto("/");await page.locator("#accountTools > summary").click();
  await expect(page.getByRole("region", { name: "我的服务" })).toContainText(
    "手机号登录暂未开通",
  );
  await expect(page.locator("[name=customerPhone]")).toHaveCount(0);
  await generate(page);
  await expect(page.locator("#cards .card")).toHaveCount(10);
});

test("账号服务失败后可重试，保留已生成的免费方案", async ({ page }) => {
  let failed = true;
  await page.route("**/api/customer/session", (route) =>
    failed ? route.abort() : route.continue(),
  );
  await page.goto("/");await page.locator("#accountTools > summary").click();
  const account = page.getByRole("region", { name: "我的服务" });
  await expect(account).toContainText("账号服务暂时不可用");
  await generate(page);
  failed = false;
  await account.getByRole("button", { name: "刷新账号状态" }).click();
  await expect(account.locator("[name=customerPhone]")).toBeVisible();
  await expect(page.locator("#cards .card")).toHaveCount(10);
});

test("翻回同一组保存会复用记录，删除后可重新保存", async ({ page }) => {
  await page.goto("/");await page.locator("#accountTools > summary").click();
  await generate(page);
  const account = await login(page, "13600008000");
  async function saveCurrent() {
    await account
      .getByRole("checkbox", { name: "我确认保存本次信息与体验方案。" })
      .check();
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/api/customer/records/save"),
    );
    await account.getByRole("button", { name: "保存当前体验方案" }).click();
    return (await response).json();
  }
  const first = await saveCurrent();
  await expect(account.locator(".customer-records li")).toHaveCount(1);
  await page.locator("#regenerate").click();
  await expect(page.locator("#resultStatus")).toContainText("第 2 组");
  await saveCurrent();
  await expect(account.locator(".customer-records li")).toHaveCount(2);
  await page.locator("#previousGroup").click();
  const repeated = await saveCurrent();
  expect(repeated.reused).toBe(true);
  expect(repeated.record.id).toBe(first.record.id);
  await expect(account.locator(".customer-records li")).toHaveCount(2);
  const old = account.locator(".customer-records li").nth(1);
  await old.getByRole("button", { name: "删除", exact: true }).click();
  await old.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(account.locator(".customer-records li")).toHaveCount(1);
  const renewed = await saveCurrent();
  expect(renewed.reused).toBe(false);
  expect(renewed.record.id).not.toBe(first.record.id);
  await expect(account.locator(".customer-records li")).toHaveCount(2);
});
