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
  if (birth) {
    await page.locator("[name=mode][value=born]").locator("..").click();
    await page.locator("[name=birthDate]").fill(birth);
    if (birthTime) await page.locator("[name=birthTime]").fill(birthTime);
  } else {
    await page.locator("[name=dueDate]").fill(due);
    if (dueTime) await page.locator("[name=dueTime]").fill(dueTime);
  }
  await page.locator("[name=place]").fill("杭州");
  await page.locator(".panel.active .next").click();
  if (avoided) await page.locator("[name=avoidedChars]").fill(avoided);
  await page.locator("button[type=submit]").click();
  await expect(page.locator("#cards .card").first()).toBeVisible();
}

for (const width of [1280, 390])
  test(`已出生四柱、边界与独立场景报告在 ${width}px 可用`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await generate(page, { avoided: "安、宁", birth: "2024-02-04", birthTime: "16:27" });
    await expect(page.locator(".bazi-title")).toContainText("实际出生");
    await expect(page.locator(".bazi-comparison")).toHaveCount(0);
    await expect(page.locator(".boundary-notice")).toContainText("出生时刻");
    await expect(page.locator("#summary")).toContainText("新生儿起名 · 已出生");
    for (const name of await page.locator("#cards h3").allTextContents())
      expect(name.slice(1)).not.toMatch(/[安宁]/);
    const pending = page.waitForEvent("download");
    await page.locator("#downloadReport").click();
    const report = await readFile(await (await pending).path(), "utf8");
    expect(report).toContain("实际出生信息：2024-02-04 16:27");
    expect(report).not.toContain("预产期参考四柱");
    expect(report).toContain("节气边界提醒");
    await page.locator("#regenerate").click();
    await expect(page.locator("#resultStatus")).toContainText("第 2 组");
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
  await page.locator("#closeSaved").click();
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
  await page.locator(".naming-constraints > summary").click();
  await page.locator("[name=requiredChars]").fill("龘");
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
  await page.route("**/api/name-counts*", async (route) => {
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
    await expect(page.locator("#resultStatus")).toContainText("第 2 组");
    await expect(comparison).toContainText("已选 2/3");
  });

for (const width of [1280, 390])
  test(`真太阳时与扶抑喜用全链路在 ${width}px 可用`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/");
    await page.locator("[name=surname]").fill("林");
    await page.locator(".panel.active .next").click();
    await page.locator("[name=mode][value=born]").locator("..").click();
    await page.locator("[name=birthDate]").fill("2024-02-10");
    await page.locator("[name=birthTime]").fill("23:05");
    await page.locator(".time-settings summary").click();
    await page.locator("[name=timeBasis]").selectOption("apparent_solar");
    await page.locator("[name=locationId]").selectOption("kashgar");
    await expect(page.locator("[name=longitude]")).toHaveValue("75.99");
    await expect(page.locator("[name=place]")).toHaveValue("喀什");
    await page.locator(".panel.active .next").click();
    await expect(
      page.getByRole("region", { name: "生成前确认" }),
    ).toContainText("真太阳时 · 经度 75.99°");
    await page.locator("#namingForm button[type=submit]").click();
    await expect(page.locator("#cards .card")).toHaveCount(3);
    const solar = page.getByRole("region", { name: "排盘时间修正" });
    await expect(solar).toContainText("真太阳时修正");
    await expect(solar).toContainText("日柱、时柱有变化");
    await expect(solar).toContainText("23:05:00");
    const mingli = page.getByRole("region", { name: "格局旺衰与喜用参考" });
    await expect(mingli).toContainText("四柱生克");
    await mingli.locator(".strength-evidence summary").click();
    await expect(mingli).toContainText("每项天干与藏干");
    await expect(mingli).toContainText("敏感性检查");
    const pending = page.waitForEvent("download");
    await page.locator("#downloadReport").click();
    const report = await readFile(await (await pending).path(), "utf8");
    for (const value of [
      "真太阳钟",
      "经度 75.99",
      "原始时间",
      "四柱分析：",
      "格局线索",
      "扶抑喜用参考",
      "不是运势分",
    ])
      expect(report).toContain(value);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBeTruthy();
  });

test("明确的扶抑参考参与选字，中和盘不强行指定", async ({ page }) => {
  await page.goto("/");
  await generate(page, {
    due: "2024-01-05",
    dueTime: "12:00",
    birth: "",
    birthTime: "",
  });
  await expect(page.locator("[name=elementPreference]")).toHaveValue(
    "yongshen",
  );
  await expect(page.locator(".result-context")).toContainText("用火 / 喜土");
  const evidence = page.getByRole("region", { name: "格局旺衰与喜用参考" });
  await expect(evidence).toContainText("用火 · 喜土");
  await page.locator("#cards .name-evidence summary").first().click();
  await expect(page.locator("#cards .name-evidence").first()).toContainText(
    "喜神参考计0.75",
  );
  await page
    .locator("#summary")
    .getByRole("button", { name: "修改出生信息" })
    .click();
  await page.locator("[name=dueDate]").fill("2024-02-10");
  await page.locator(".panel.active .next").click();
  await page.locator("#namingForm button[type=submit]").click();
  await expect(page.locator(".result-context")).toContainText(
    "喜用参考暂不参与排序",
  );
  await expect(evidence).toContainText("暂不指定单一喜用");
});

test("启用真太阳时后缺失或越界经度会定位填写处", async ({ page }) => {
  await page.goto("/");
  await page.locator("[name=surname]").fill("林");
  await page.locator(".panel.active .next").click();
  await page.locator("[name=dueDate]").fill("2099-12-23");
  await page.locator("[name=place]").fill("杭州");
  await page.locator(".time-settings summary").click();
  await page.locator("[name=timeBasis]").selectOption("apparent_solar");
  await page.locator(".time-settings summary").click();
  await page.locator(".panel.active .next").click();
  await expect(page.locator(".time-settings")).toHaveAttribute("open", "");
  await expect(page.locator("#formMessage")).toContainText("出生地经度");
  await page.locator("[name=longitude]").fill("181");
  await page.locator(".panel.active .next").click();
  await expect(page.locator(".panel.active legend")).toHaveText("出生信息");
  await page.locator("[name=longitude]").fill("120.16");
  await page.locator(".panel.active .next").click();
  await page.locator("#namingForm button[type=submit]").click();
  await expect(page.locator("#cards .card")).toHaveCount(3);
});

for (const width of [1280, 390])
  test(`四柱生克和古籍出处可逐项核对 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/");
    await generate(page, {
      due: "2024-02-10",
      dueTime: "12:00",
      birth: "",
      birthTime: "",
    });
    await expect(page.locator("#cards .card-status").first()).toHaveText(
      "原句已对照",
    );
    const area = page.getByRole("region", { name: "格局旺衰与喜用参考" });
    await expect(area).not.toContainText("古籍与参数待复核");
    await area.locator(".pillar-relations>summary").click();
    await expect(area.locator(".pillar-relations")).toContainText("年柱");
    await expect(area.locator(".pillar-relations")).toContainText("月柱");
    await expect(area.locator(".relation-weights")).toContainText("生我");
    await area.locator(".pairwise-relations>summary").click();
    await expect(area.locator(".pairwise-relations tbody tr")).toHaveCount(13);
    await area.getByLabel("生克关系筛选").selectOption("");
    await expect(area.locator(".pairwise-relations tbody tr")).toHaveCount(28);
    await area.locator(".classical-evidence>summary").click();
    await expect(area.locator(".classical-evidence")).toContainText(
      "15 处录文已核对",
    );
    await expect(area.locator(".classical-citations")).toContainText(
      "三命通会",
    );
    await expect(area.locator(".classical-citations")).toContainText("说卦");
    const link = area.locator(".classical-citations a").first();
    await expect(link).toHaveAttribute(
      "href",
      /github\.com\/kanripo\/[^/]+\/blob\/[0-9a-f]{40}\//,
    );
    const pending = page.waitForEvent("download");
    await page.locator("#downloadReport").click();
    const report = await readFile(await (await pending).path(), "utf8");
    for (const text of [
      "经典原文与计算方法",
      "原文位置：https://github.com/kanripo/",
      "四柱阴阳五行与生克关系",
      "按日主生克分项权重",
      "出处记录",
    ])
      expect(report).toContain(text);
    expect(report).not.toContain("古籍出处与参数核验状态：待复核");
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBeTruthy();
  });

for (const width of [1280, 390])
  test(`步骤定位、场景日期隔离及快捷生成 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/");
    await page.locator("[name=surname]").fill("林");
    await page.locator(".panel.active .next").click();
    await expect(page.locator(".panel.active legend")).toBeFocused();
    expect(
      await page
        .locator(".panel.active legend")
        .evaluate((el) => el.getBoundingClientRect().top),
    ).toBeGreaterThanOrEqual(0);
    await expect(page.locator("[name=birthDate]")).toHaveCount(0);
    await page.locator("[name=dueDate]").fill("2099-12-23");
    await page.locator("[name=place]").fill("杭州");
    await page.locator("[name=mode][value=born]").locator("..").click();
    await expect(page.locator("[name=dueDate]")).toHaveCount(0);
    await page.locator("[name=birthDate]").fill("2024-01-05");
    await page.locator("[name=birthTime]").fill("12:00");
    await page.locator("[name=mode][value=due_date]").locator("..").click();
    await expect(page.locator("[name=dueDate]")).toHaveValue("2099-12-23");
    await expect(page.locator(".birth-basis-preview")).toContainText("预产期 2099-12-23");
    await expect(page.locator("[name=birthDate]")).toHaveCount(0);
    await page.locator("[name=mode][value=born]").locator("..").click();
    await expect(page.locator("[name=birthDate]")).toHaveValue("2024-01-05");
    const submitted = page.waitForRequest("**/api/analyze");
    await page.locator(".quick-generate").click();
    const data = (await submitted).postDataJSON();
    expect(data.mode).toBe("born");
    expect(data).not.toHaveProperty("dueDate");
    expect(data).not.toHaveProperty("dueTime");
    await expect(page.locator("#cards .card")).toHaveCount(3);
    await expect(page.locator(".bazi-title")).toContainText("实际出生");
    await page
      .getByRole("button", { name: "调整偏好", exact: true })
      .first()
      .click();
    await page.locator(".progress button").nth(0).click();
    await expect(page.locator("[name=surname]")).toHaveValue("林");
    await page.locator(".progress button").nth(1).click();
    await expect(page.locator("[name=birthTime]")).toHaveValue("12:00");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  });

test("修改条件明确应用，失败保留旧方案，重试采用新偏好", async ({ page }) => {
  await page.goto("/");
  await generate(page, { due: "2099-12-23", birth: "", birthTime: "" });
  const oldNames = await page.locator("#cards h3").allTextContents();
  await page
    .getByRole("button", { name: "调整偏好", exact: true })
    .first()
    .click();
  await page.locator("[name=likedChars]").fill("安");
  await page.locator("[name=elementPreference]").selectOption("none");
  await expect(
    page.getByRole("region", { name: "尚未应用的修改" }),
  ).toBeVisible();
  const abort = (route) => route.abort();
  await page.route("**/api/analyze", abort);
  await page.getByRole("button", { name: "应用修改并生成" }).click();
  await expect(page.locator("#formMessage")).toContainText("无法连接");
  expect(await page.locator("#cards h3").allTextContents()).toEqual(oldNames);
  await expect(page.locator("#downloadReport")).toBeEnabled();
  await page.unroute("**/api/analyze", abort);
  const request = page.waitForRequest("**/api/analyze");
  await page.getByRole("button", { name: "应用修改并生成" }).click();
  const data = (await request).postDataJSON();
  expect(data.likedChars).toBe("安");
  expect(data.elementPreference).toBe("none");
  expect(data.variant).toBe(0);
  await expect(
    page.getByRole("region", { name: "尚未应用的修改" }),
  ).toHaveCount(0);
  expect((await page.locator("#cards h3").allTextContents()).some(name => name.includes("安"))).toBeTruthy();
});

test("跨组比较保留，上一组与下一组可找回且不重复请求", async ({ page }) => {
  await page.goto("/");
  await generate(page, { due: "2099-12-23", birth: "", birthTime: "" });
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/analyze")) requests++;
  });
  const first = await page.locator("#cards h3").allTextContents();
  await page.locator("#cards .compare-name").first().click();
  await page.locator("#cards .save").first().click();
  await page.locator("#regenerate").click();
  await expect(page.locator("#resultStatus")).toContainText("第 2 组");
  const second = await page.locator("#cards h3").allTextContents();
  expect(second).not.toEqual(first);
  await expect(page.locator(".candidate-comparison")).toContainText(first[0]);
  await page.locator("#cards .compare-name").first().click();
  await expect(page.locator(".candidate-comparison")).toContainText("已选 2/3");
  await page.locator("#previousGroup").click();
  expect(await page.locator("#cards h3").allTextContents()).toEqual(first);
  await page.locator("#regenerate").click();
  expect(await page.locator("#cards h3").allTextContents()).toEqual(second);
  expect(requests).toBe(1);
  await page
    .getByRole("button", { name: /本机收藏/ })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "本机收藏 1" })
    .getByRole("button", { name: "查看方案" })
    .click();
  await expect(page.locator("#savedPanel")).not.toBeVisible();
  expect(await page.locator("#cards h3").allTextContents()).toEqual(first);
  await expect(page.locator(".candidate-comparison")).toContainText(second[0]);
});

test("收藏搜索、复制、清空撤销及键盘关闭形成完整回路", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__shortlist = value;
        },
      },
    }),
  );
  await page.goto("/");
  await generate(page, { due: "2099-12-23", birth: "", birthTime: "" });
  const first = await page.locator("#cards h3").first().innerText();
  await page.locator("#cards .save").first().click();
  await page.locator("#cards .save").nth(1).click();
  const trigger = page.getByRole("button", { name: "本机收藏 2" });
  await trigger.click();
  const panel = page.locator("#savedPanel");
  await expect(panel).toBeVisible();
  await expect(page.locator("#closeSaved")).toBeFocused();
  await panel.getByLabel("查找收藏").fill("不存在的名字");
  await expect(panel).toContainText("没有找到匹配");
  await panel.getByRole("button", { name: "查看全部收藏" }).click();
  await expect(panel.locator(".saved-item")).toHaveCount(2);
  await panel.getByRole("button", { name: "复制收藏清单" }).click();
  const copied = await page.evaluate(() => window.__shortlist);
  expect(copied).toContain(first);
  expect(copied).not.toContain("2099-12-23");
  await panel.getByRole("button", { name: "清空本机收藏" }).click();
  await expect(panel.locator(".saved-item")).toHaveCount(0);
  await panel.getByRole("button", { name: "撤销" }).click();
  await expect(panel.locator(".saved-item")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(trigger).toBeFocused();
  const stored = await page.evaluate(() =>
    localStorage.getItem("序名收藏详情"),
  );
  expect(stored).not.toContain("dueDate");
  expect(stored).not.toContain("2099-12-23");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("改名先分析现名且最后一组不再循环换名", async ({ page }) => {
  await page.goto("/");
  await page
    .locator("[name=purpose][value=rename]")
    .evaluate((el) => el.click());
  await page.locator("[name=surname]").fill("王");
  await page.locator("[name=currentName]").fill("王知远");
  await page.locator("[name=length]").selectOption("3");
  await page.locator("[name=candidateCount]").fill("10");
  await page.locator(".panel.active .next").click();
  await expect(page.locator("[name=mode][value=due_date]")).toBeDisabled();
  await page.locator("[name=birthDate]").fill("2024-01-05");
  await page.locator("[name=birthTime]").fill("12:00");
  await page.locator("[name=place]").fill("杭州");
  await expect(page.locator(".quick-generate")).toBeHidden();
  await page.locator(".panel.active .next").click();
  await expect(page.locator("#formNameReview")).toContainText("王知远");
  await expect(page.locator("#cards .card")).toHaveCount(0);
  await page.locator(".panel.active .next").click();
  await page.locator(".naming-constraints > summary").click();
  await page.locator("[name=requiredChars]").fill("安宁明");
  await page.locator("#namingForm button[type=submit]").click();
  await expect(page.locator("#cards .card")).toHaveCount(6);
  await expect(page.locator("#summary")).toContainText("改名方案");
  await expect(page.locator("#summary")).not.toContainText("新生儿");
  await expect(page.locator("#regenerate")).toBeDisabled();
  await expect(page.locator("#regenerate")).toContainText("本条件已看完");
});

for (const width of [1280, 390]) test(`改名现名报告、确认、推荐与下载在 ${width}px 严格顺序执行`, async ({page})=>{
  await page.setViewportSize({width,height:900});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  const paths=[]; page.on('request',request=>{if(request.url().match(/\/api\/(analyze|name-review)$/)) paths.push(new URL(request.url()).pathname);});
  await page.goto('/');
  await page.locator('[name=purpose][value=rename]').locator("..").click();
  await page.locator('[name=surname]').fill('李');
  await page.locator('.panel.active .next').click();
  await expect(page.locator('[name=currentName]')).toHaveAttribute('aria-invalid','true');
  await page.locator('[name=currentName]').fill('李景和');
  await page.locator('.panel.active .next').click();
  await expect(page.locator('[name=dueDate]')).toHaveCount(0);
  await page.locator('[name=birthDate]').fill('1998-08-13');
  await page.locator('[name=birthTime]').fill('13:48');
  await page.locator('[name=place]').fill('河南南阳');
  await page.locator('.panel.active .next').click();
  const report=page.locator('#formNameReview');
  await expect(report).toBeVisible();
  for(const value of ['李景和','姓名结构','普通话读音','字形五行依据','出生四柱与选字方向']) await expect(report).toContainText(value);
  expect(paths).toEqual(['/api/name-review']);
  await expect(page.locator('#cards .card')).toHaveCount(0);
  await page.locator('.panel.active .next').click();
  await page.locator('[name=elementPreference]').selectOption('水');
  await page.getByRole('button',{name:'生成改名方案 ✦',exact:true}).click();
  await expect(page.locator('#cards .card')).toHaveCount(3);
  await expect(page.locator('#summary')).toContainText('改名方案');
  await expect(page.locator('#summary')).not.toContainText('新生儿');
  expect(await page.locator('#cards h3').allTextContents()).not.toContain('李景和');
  expect(paths).toEqual(['/api/name-review','/api/analyze']);
  await page.locator('#cards .card').first().getByText('与现用姓名比较',{exact:true}).click();
  await expect(page.locator('#cards .card').first()).toContainText('出生四柱不随改名改变');
  const pending=page.waitForEvent('download');await page.locator('#downloadReport').click();
  const text=await readFile(await (await pending).path(),'utf8');
  expect(text).toContain('改名分析与推荐方案');
  expect(text.indexOf('## 现用姓名分析')).toBeLessThan(text.indexOf('## 改名候选'));
  expect(text).toContain('现用姓名：李景和');expect(text).not.toContain('新生儿');expect(text).not.toContain('预产期');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('现名分析失败可重试，修改出生资料必须重新分析后才能推荐',async({page})=>{
  await page.goto('/');
  await page.locator('[name=purpose][value=rename]').locator("..").click();
  await page.locator('[name=surname]').fill('林');await page.locator('[name=currentName]').fill('林安');
  await page.locator('.panel.active .next').click();
  await page.locator('[name=birthDate]').fill('2000-01-01');await page.locator('[name=birthTime]').fill('12:00');await page.locator('[name=place]').fill('杭州');
  const abort=route=>route.abort();await page.route('**/api/name-review',abort);
  await page.locator('.panel.active .next').click();await expect(page.locator('#formMessage')).toContainText('无法连接');
  await expect(page.locator('.panel.active legend')).toHaveText('出生信息');
  await expect(page.locator('#cards .card')).toHaveCount(0);
  await page.unroute('**/api/name-review',abort);await page.locator('.panel.active .next').click();await expect(page.locator('#formNameReview')).toBeVisible();
  await page.locator('.panel.active .next').click();
  await page.getByRole('region',{name:'生成前确认'}).getByRole('button',{name:'修改出生信息'}).click();
  await page.locator('[name=birthTime]').fill('13:48');
  const response=page.waitForResponse('**/api/name-review');
  await page.locator('.panel.active .next').click();
  expect((await (await response).json()).analysis.name_review.findings.at(-1).detail).toContain('13:48');
  await expect(page.locator('#formNameReview')).toBeVisible();await expect(page.locator('#cards .card')).toHaveCount(0);
  await page.locator('.panel.active .next').click();await page.locator('#namingForm button[type=submit]').click();await expect(page.locator('#cards .card')).toHaveCount(3);
});

test('切换起名场景立即收起旧方案，不把旧新生儿结果冒充改名',async({page})=>{
  await page.goto('/');await generate(page,{due:'2099-12-23',birth:'',birthTime:''});
  await page.getByRole('button',{name:'调整偏好',exact:true}).first().click();await page.locator('.progress button').first().click();
  await page.locator('[name=purpose][value=rename]').locator("..").click();
  await expect(page.locator('#cards .card')).toHaveCount(0);await expect(page.locator('#summary')).not.toContainText('新生儿');await expect(page.locator('#downloadReport')).toBeDisabled();
  await page.locator('[name=currentName]').fill('林安');await page.locator('.panel.active .next').click();
  await expect(page.locator('[name=dueDate]')).toHaveCount(0);
  await page.locator('[name=birthDate]').fill('2000-01-01');await page.locator('[name=birthTime]').fill('12:00');await page.locator('[name=place]').fill('杭州');
  await page.locator('.panel.active .next').click();await expect(page.locator('#formNameReview')).toBeVisible();await page.locator('.panel.active .next').click();await page.locator('#namingForm button[type=submit]').click();
  await expect(page.locator('#summary')).toContainText('改名方案');
});

test('修改现名后不能沿用旧报告，切回新生儿不会带上现名',async({page})=>{
  await page.goto('/');await page.locator('[name=purpose][value=rename]').locator('..').click();
  await page.locator('[name=surname]').fill('李');await page.locator('[name=currentName]').fill('李景和');await page.locator('.panel.active .next').click();
  await page.locator('[name=birthDate]').fill('1998-08-13');await page.locator('[name=birthTime]').fill('13:48');await page.locator('[name=place]').fill('南阳');
  await page.locator('.panel.active .next').click();await expect(page.locator('#formNameReview')).toContainText('李景和');await page.locator('.panel.active .next').click();
  await page.getByRole('region',{name:'生成前确认'}).getByRole('button',{name:'修改基本信息'}).click();await page.locator('[name=currentName]').fill('李清晏');
  const review=page.waitForRequest('**/api/name-review');await page.locator('.progress button').nth(3).click();expect((await review).postDataJSON().currentName).toBe('李清晏');
  await expect(page.locator('#formNameReview')).toContainText('李清晏');await expect(page.locator('#formNameReview')).not.toContainText('李景和');await expect(page.locator('#cards .card')).toHaveCount(0);
  await page.locator('.progress button').first().click();await page.locator('[name=purpose][value=newborn]').locator('..').click();await expect(page.locator('[name=currentName]')).toBeDisabled();
  await page.locator('.panel.active .next').click();const request=page.waitForRequest('**/api/analyze');await page.locator('.quick-generate').click();
  const data=(await request).postDataJSON();expect(data.purpose).toBe('newborn');expect(data).not.toHaveProperty('currentName');expect(data).not.toHaveProperty('dueDate');await expect(page.locator('#summary')).toContainText('新生儿起名 · 已出生');await expect(page.locator('.result-name-review')).toHaveCount(0);
});

for (const width of [1280,390]) test(`古籍原句、康熙明细和新算法报告在 ${width}px 可用`,async({page})=>{
  await page.setViewportSize({width,height:950});await page.goto('/');
  const response=page.waitForResponse('**/api/analyze');await generate(page,{due:'2099-12-23',birth:'',birthTime:''});
  const payload=await (await response).json();expect(payload.analysis.algorithm).toBe('literary_v3');expect(payload.analysis.available_candidate_count).toBeGreaterThan(65);
  expect(payload.analysis.corpus.character_records).toBe(3636);
  const card=page.locator('#cards .card').first();await expect(card.locator('.card-status')).toHaveText('原句已对照');
  await card.locator('.literary-citations > summary').click();
  await expect(card.locator('blockquote')).toHaveCount(payload.candidates[0].citations.length);
  await expect(card.locator('blockquote').first()).toHaveText(payload.candidates[0].citations[0].quote);
  await card.locator('.candidate-provenance').getByText('查看康熙笔画与五格参考',{exact:true}).click();
  await expect(card.locator('.numerology-evidence')).toBeVisible();
  const pending=page.waitForEvent('download');await page.locator('#downloadReport').click();const text=await readFile(await (await pending).path(),'utf8');
  for(const value of ['literary-match-v3','文件SHA-256','取字方式','逐字康熙笔画','全名读音','数理']) expect(text).toContain(value);
  expect(text).not.toContain('派生未核验吉凶分');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('辈分必用字与避讳严格生效，冲突定位输入而不丢旧结果',async({page})=>{
  await page.goto('/');await page.locator('[name=surname]').fill('欧阳');await page.locator('[name=candidateCount]').fill('11');await page.locator('.panel.active .next').click();
  await page.locator('[name=dueDate]').fill('2099-12-23');await page.locator('[name=place]').fill('杭州');await page.locator('.panel.active .next').click();
  await page.locator('.naming-constraints > summary').click();await page.locator('[name=requiredChars]').fill('安');await page.locator('[name=tabooChars]').fill('宁');
  await page.locator('#namingForm button[type=submit]').click();await expect(page.locator('#cards .card')).toHaveCount(11);
  const names=await page.locator('#cards h3').allTextContents();for(const name of names){expect(name.startsWith('欧阳')).toBeTruthy();expect(name.slice(2)).toContain('安');expect(name.slice(2)).not.toContain('宁');}
  await page.locator('[name=avoidedChars]').fill('安');await page.locator('#namingForm button[type=submit]').click();await expect(page.locator('#formMessage')).toContainText('冲突');await expect(page.locator('[name=requiredChars]')).toBeFocused();expect(await page.locator('#cards h3').allTextContents()).toEqual(names);
});

test('五格严格筛选与缺失笔画空结果可以调整，未知不判为生僻',async({page})=>{
  await page.goto('/');await generate(page,{due:'2099-12-23',birth:'',birthTime:''});
  await page.getByRole('button',{name:'调整偏好',exact:true}).first().click();await page.locator('.naming-constraints > summary').click();await page.locator('[name=numerologyMode]').selectOption('strict');
  let response=page.waitForResponse('**/api/analyze');await page.locator('#namingForm button[type=submit]').click();let payload=await (await response).json();expect(payload.candidates.length).toBeGreaterThan(0);expect(payload.candidates.every(x=>x.numerology.strict_pass)).toBeTruthy();
  await page.locator('[name=requiredChars]').fill('清');response=page.waitForResponse('**/api/analyze');await page.locator('#namingForm button[type=submit]').click();payload=await (await response).json();expect(payload.candidates).toEqual([]);await expect(page.locator('#cards .empty-result')).toBeVisible();await expect(page.locator('#cards .empty-result')).not.toContainText('生僻');
  await page.getByRole('button',{name:'调整数理筛选',exact:true}).click();await expect(page.locator('[name=numerologyMode]')).toBeFocused();await page.locator('[name=numerologyMode]').selectOption('off');await page.locator('#namingForm button[type=submit]').click();await expect(page.locator('#cards .card')).toHaveCount(3);for(const name of await page.locator('#cards h3').allTextContents())expect(name).toContain('清');
});

test('多音姓指定读法贯穿读音、生成与报告',async({page})=>{
  await page.goto('/');await page.locator('[name=surname]').fill('单');await page.locator('.family-options > summary').click();await page.locator('[name=surnameReading]').fill('dān');await page.locator('.panel.active .next').click();await page.locator('[name=dueDate]').fill('2099-12-23');await page.locator('[name=place]').fill('杭州');await page.locator('.panel.active .next').click();
  const response=page.waitForResponse('**/api/analyze');await page.locator('#namingForm button[type=submit]').click();const data=await (await response).json();expect(data.candidates.every(x=>x.pronunciation.evaluation.full_pinyin.startsWith('dān '))).toBeTruthy();
  await expect(page.locator('#cards .name-full-reading').first()).toContainText('dān');
});

test('三字名可生成11个，必用字不被多样性规则移除',async({page})=>{
  await page.setViewportSize({width:390,height:950});await page.goto('/');await page.locator('[name=surname]').fill('林');await page.locator('[name=length]').selectOption('3');await page.locator('[name=candidateCount]').fill('11');await page.locator('.panel.active .next').click();await page.locator('[name=dueDate]').fill('2099-12-23');await page.locator('[name=place]').fill('杭州');await page.locator('.panel.active .next').click();await page.locator('.naming-constraints > summary').click();await page.locator('[name=requiredChars]').fill('安');await page.locator('#namingForm button[type=submit]').click();await expect(page.locator('#cards .card')).toHaveCount(11);const names=await page.locator('#cards h3').allTextContents();expect(new Set(names).size).toBe(11);expect(names.every(name=>[...name].length===4&&name.includes('安'))).toBeTruthy();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
