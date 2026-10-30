import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
function token() {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac(
    "sha1",
    Buffer.from("00112233445566778899aabbccddeeff00112233", "hex"),
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
