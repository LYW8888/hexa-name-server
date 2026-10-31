import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function generate(
  page,
  {
    due = "2024-02-04",
    dueTime = "16:27",
    birth = "2024-02-05",
    birthTime = "12:00",
    avoided = "",
  } = {},
) {
  await page.locator("[name=surname]").fill("林");
  await page.locator(".panel.active .next").click();
  await page.locator("[name=dueDate]").fill(due);
  if (dueTime) await page.locator("[name=dueTime]").fill(dueTime);
  if (birth) await page.locator("[name=birthDate]").fill(birth);
  if (birthTime) await page.locator("[name=birthTime]").fill(birthTime);
  await page.locator("[name=place]").fill("杭州");
  await page.locator(".panel.active .next").click();
  if (avoided) await page.locator("[name=avoidedChars]").fill(avoided);
  await page.locator("button[type=submit]").click();
  await expect(page.locator("#cards .card").first()).toBeVisible();
}

for (const width of [1280, 390])
  test(`四柱、预产期对照与报告在 ${width}px 可用`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await generate(page, { avoided: "安、宁" });
    await expect(page.locator(".bazi-title")).toContainText("实际出生");
    await expect(page.locator(".bazi-comparison")).toContainText(
      "靠近节气，需复核",
    );
    await expect(page.locator(".bazi-comparison")).toContainText(
      "预产期参考时刻",
    );
    for (const name of await page.locator("#cards h3").allTextContents())
      expect(name.slice(1)).not.toMatch(/[安宁]/);
    const pending = page.waitForEvent("download");
    await page.locator("#downloadReport").click();
    const report = await readFile(await (await pending).path(), "utf8");
    expect(report).toContain("预产期参考四柱");
    expect(report).toContain("预产期参考边界");
    await page.locator("#regenerate").click();
    await expect(page.locator("#resultStatus")).toContainText("第 1 轮");
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBeTruthy();
  });

test("旧收藏格式、图片和推荐链接保持兼容及隐私", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("序名收藏", JSON.stringify(["林安"]));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__copied = value;
        },
      },
    });
  });
  await page.goto("/?birthDate=2000-01-01&name=秘密#private");
  await page.locator("#savedButton").click();
  await expect(page.locator("#savedList")).toContainText("林安");
  await generate(page, {});
  const first = await page.locator("#cards h3").first().innerText();
  await page.locator("#cards .make-keepsake").first().click();
  await expect(page.locator("#keepsakeName")).toHaveValue(first);
  const download = page.waitForEvent("download");
  await page.locator("#downloadKeepsake").click();
  const image = await readFile(await (await download).path());
  expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  await page.locator("#copySiteLink").click();
  expect(await page.evaluate(() => window.__copied)).toBe(
    "http://127.0.0.1:4191/?utm_source=share&utm_medium=referral",
  );
});

test("离线缓存可供本地心愿卡使用", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.locator("#keepsakeName").fill("林知衡");
  const pending = page.waitForEvent("download");
  await page.locator("#downloadKeepsake").click();
  const image = await readFile(await (await pending).path());
  expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
});

test("减少动态效果、键盘及新生儿与改名切换", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto("/");
  await expect(page.locator("#currentNameField")).toBeHidden();
  expect(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector(".orb"), "::before")
          .animationName,
    ),
  ).toBe("none");
  await page.locator("[name=purpose][value=rename]").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#currentNameField")).toBeVisible();
  await expect(page.locator("[name=mode][value=born]")).toBeChecked();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBeTruthy();
});

test("升级后清理旧版本离线缓存", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.unregister();
    const cache = await caches.open("xuming-mvp-v26");
    await cache.put("/old-private", new Response("old"));
  });
  await page.reload();
  await page.waitForFunction(
    async () => !(await caches.keys()).includes("xuming-mvp-v26"),
  );
  expect(
    (await page.evaluate(() => caches.keys())).some((key) =>
      key.startsWith("xuming-react-"),
    ),
  ).toBeTruthy();
});

test("候选为空、偏好冲突和服务不可用时给出清晰结果", async ({ page }) => {
  await page.goto("/");
  await page.locator("[name=surname]").fill("林");
  await page.locator("[name=length]").selectOption("1");
  await page.locator(".panel.active .next").click();
  await page.locator("[name=dueDate]").fill("2099-01-01");
  await page.locator("[name=place]").fill("杭州");
  await page.locator(".panel.active .next").click();
  await page
    .locator("[name=avoidedChars]")
    .fill(
      "安 澄 明 宁 远 知 衡 清 景 和 嘉 书 舒 川 若 桐 柏 煜 烨 培 均 钧 铭 沐 泽",
    );
  await page.locator("button[type=submit]").click();
  await expect(page.locator("#cards .empty-result")).toBeVisible();
  await expect(page.locator("#downloadReport")).toBeDisabled();
  await page.locator("[name=likedChars]").fill("安");
  await page.locator("button[type=submit]").click();
  await expect(page.locator("#formMessage")).toContainText("不能重复");
  await expect(page.locator("#cards .card")).toHaveCount(0);
  await page.locator("[name=likedChars]").fill("");
  await page.route("**/api/analyze", (route) => route.abort());
  await page.locator("button[type=submit]").click();
  await expect(page.locator("#formMessage")).toContainText("无法连接排盘服务");
  await expect(page.locator("#cards .card")).toHaveCount(0);
});

test("字库数量晚到时会同步修正数量上限", async ({ page }) => {
  await page.route("**/api/name-counts", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ json: { counts: { 1: 15, 2: 15, 3: 5 } } });
  });
  await page.goto("/");
  await page.locator("[name=length]").selectOption("3");
  await page.locator("[name=candidateCount]").fill("11");
  await expect(page.locator("[name=candidateCount]")).toHaveAttribute(
    "max",
    "5",
  );
  await expect(page.locator("[name=candidateCount]")).toHaveValue("5");
});

test("手机导航可通过键盘打开、关闭并跳转", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const button = page.locator("#mobileMenuButton"),
    menu = page.locator("#mobileMenu");
  await expect(menu).toBeHidden();
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
  await button.click();
  await menu.getByRole("link", { name: "心愿卡" }).click();
  await expect(menu).toBeHidden();
  await expect(page).toHaveURL(/#keepsake$/);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBeTruthy();
});

test("单次服务说明清楚展示，规划中的服务不会开放购买", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#pricing");
  const policy = page.getByRole("region", { name: "单次服务机制" });
  await expect(policy).toContainText("不订阅、不自动续费");
  await expect(policy).toContainText("重复获取同一份报告不新增服务费用");
  await expect(policy).toContainText("规划中");
  await expect(policy).toContainText("不会自动收费");
  await page.locator("[data-plan=planned]").click();
  await expect(page.locator("#toast")).toContainText("没有开通购买或收费");
  await expect(page.getByRole("button", { name: "立即购买" })).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBeTruthy();
});

async function fillForSubmission(page) {
  await page.locator("[name=surname]").fill("林");
  await page.locator(".panel.active .next").click();
  await page.locator("[name=dueDate]").fill("2099-01-01");
  await page.locator("[name=place]").fill("杭州");
  await page.locator(".panel.active .next").click();
}

test("生成超时会结束等待并可重试，重复提交只发一次请求", async ({ page }) => {
  await page.goto("/");
  await fillForSubmission(page);
  let stalled,
    requests = 0;
  const hold = (route) => {
    requests++;
    stalled = route;
  };
  await page.route("**/api/analyze", hold);
  await page.locator("#namingForm").evaluate((form) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page.locator(".generation-progress")).toBeVisible();
  await expect(page.locator("#namingForm button[type=submit]")).toBeDisabled();
  await expect(page.locator("#formMessage")).toContainText("响应超时", {
    timeout: 18000,
  });
  await expect(page.locator("#formMessage")).toBeInViewport();
  expect(requests).toBe(1);
  await expect(page.locator("#namingForm button[type=submit]")).toBeEnabled();
  await page.unroute("**/api/analyze", hold);
  await stalled.abort().catch(() => {});
  await page.locator("#namingForm button[type=submit]").click();
  await expect(page.locator("#cards .card")).toHaveCount(3);
});

test("接口缺失或返回代理页面时在生成按钮旁给出明确错误", async ({ page }) => {
  await page.goto("/");
  await fillForSubmission(page);
  let failure = "missing";
  await page.route("**/api/analyze", (route) =>
    route.fulfill({
      status: failure === "missing" ? 404 : failure === "proxy" ? 502 : 200,
      contentType: "text/html",
      body: "<html>static proxy page</html>",
    }),
  );
  for (const [kind, text] of [
    ["missing", "未接通起名接口"],
    ["proxy", "暂时不可用"],
    ["html", "无法识别"],
  ]) {
    failure = kind;
    await page.locator("#namingForm button[type=submit]").click();
    await expect(page.locator("#formMessage")).toContainText(text);
    await expect(page.locator("#formMessage")).toBeInViewport();
    await expect(page.locator("#namingForm button[type=submit]")).toBeEnabled();
  }
  await expect(page.locator("#cards .card")).toHaveCount(0);
});

test("最后提交会检查隐藏步骤的字段并定位到需要修改的一步", async ({ page }) => {
  await page.goto("/");
  await fillForSubmission(page);
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/analyze")) requests++;
  });
  await page.locator("[name=candidateCount]").evaluate((field) => {
    field.value = "0";
  });
  await page.locator("#namingForm button[type=submit]").click();
  await expect(page.locator(".panel.active legend")).toHaveText("对象与姓氏");
  await expect(page.locator("#formMessage")).toContainText("整数");
  expect(requests).toBe(0);
  await page.locator("[name=candidateCount]").fill("3");
  await page.locator(".panel.active .next").click();
  await page.locator(".panel.active .next").click();
  await page.locator("#namingForm button[type=submit]").click();
  await expect(page.locator("#cards .card")).toHaveCount(3);
});

test("回车可继续填写步骤并提交生成", async ({ page }) => {
  await page.goto("/");
  await page.locator("[name=surname]").fill("林");
  await page.locator("[name=surname]").press("Enter");
  await expect(page.locator(".panel.active legend")).toHaveText("出生信息");
  await page.locator("[name=dueDate]").fill("2099-01-01");
  await page.locator("[name=place]").fill("杭州");
  await page.locator("[name=place]").press("Enter");
  await expect(page.locator(".panel.active legend")).toHaveText("偏好与寓意");
  await page.locator("[name=likedChars]").press("Enter");
  await expect(page.locator("#cards .card")).toHaveCount(3);
});

test("旧页面与新脚本混用会显示更新提示，刷新保留收藏", async ({ page }) => {
  const html = await readFile(
    new URL("./fixtures/legacy-generation.html", import.meta.url),
    "utf8",
  );
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("序名收藏", '["林安"]'));
  await page.route("**/legacy-generation", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("/legacy-generation");
  await expect(page.locator("#legacyVersionNotice")).toContainText(
    "版本不一致",
  );
  await page.locator("#namingForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#legacyVersionNotice")).toBeInViewport();
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "刷新完整页面" }).click();
  await expect(page).toHaveURL(/app_refresh=/);
  await expect(page.locator("#savedCount")).toHaveText("1");
  await expect(page.locator("#namingForm")).toHaveAttribute("novalidate", "");
});

test("保留的旧版完整页面也能正常提交未来预产期", async ({ page }) => {
  const html = await readFile(
    new URL("../../index.html", import.meta.url),
    "utf8",
  );
  await page.route("**/legacy-current", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("/legacy-current");
  await fillForSubmission(page);
  await page.locator("#namingForm button[type=submit]").click();
  await expect(page.locator("#cards .card")).toHaveCount(3);
});

for (const width of [1280, 390])
  test(`生成确认、真实依据与候选比较在 ${width}px 可用`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.locator("[name=surname]").fill("欧阳");
    await expect(page.locator("#namingForm")).toContainText(
      "欧阳沐安，共 4 字",
    );
    await page.locator(".panel.active .next").click();
    await page.locator("[name=dueDate]").fill("2099-12-23");
    await page.locator("[name=place]").fill("杭州");
    await page.locator(".panel.active .next").click();
    const review = page.getByRole("region", { name: "生成前确认" });
    await expect(review).toContainText("2099-12-23 12:00");
    await review.getByRole("button", { name: "修改基本信息" }).click();
    await page.locator("[name=candidateCount]").fill("4");
    await page.locator(".panel.active .next").click();
    await page.locator(".panel.active .next").click();
    await page.locator("[name=elementPreference]").selectOption("水");
    await page.locator("#namingForm button[type=submit]").click();
    await expect(page.locator("#cards .card")).toHaveCount(4);
    const cards = page.locator("#cards .card");
    expect(
      await page
        .locator(".result-context")
        .evaluate((el) => getComputedStyle(el).display),
    ).toBe("flex");
    await expect(cards.first()).toContainText("偏好匹配");
    await expect(cards.first()).not.toContainText("演示评分");
    await cards.first().locator(".name-evidence summary").click();
    await expect(cards.first().locator(".name-evidence")).toContainText(
      "字形五行意象",
    );
    await expect(page.locator(".polarity-summary")).toContainText("四柱阴阳");
    await page.locator(".hidden-stems summary").click();
    await expect(page.locator(".hidden-stems")).toContainText("天干十神");
    await expect(
      page.getByRole("region", { name: "生辰起卦依据" }),
    ).toContainText("动第");
    expect(
      await page.evaluate(
        () =>
          !!(
            document
              .querySelector("#cards")
              .compareDocumentPosition(
                document.querySelector("#traditionalBasis"),
              ) & Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
    ).toBeTruthy();
    for (let i = 0; i < 3; i++)
      await cards.nth(i).locator(".compare-name").click();
    await expect(cards.nth(3).locator(".compare-name")).toBeDisabled();
    const comparison = page.getByRole("region", { name: "候选名字比较" });
    await expect(comparison).toContainText("已选 3/3");
    await expect(comparison).toContainText("不是运势分");
    await cards.first().locator(".compare-name").click();
    await expect(cards.nth(3).locator(".compare-name")).toBeEnabled();
    await expect(comparison).toContainText("已选 2/3");
    const pending = page.waitForEvent("download");
    await page.locator("#downloadReport").click();
    const report = await readFile(await (await pending).path(), "utf8");
    for (const text of [
      "四柱阴阳",
      "藏干单独计数",
      "起卦方法",
      "选字参考：自选水意象",
      "偏好匹配",
    ])
      expect(report).toContain(text);
    expect(report).not.toContain("评分和卦象关联仍为演示");
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBeTruthy();
    await page.locator("#regenerate").click();
    await expect(page.locator("#resultStatus")).toContainText("第 1 轮");
    await expect(comparison).toHaveCount(0);
  });
