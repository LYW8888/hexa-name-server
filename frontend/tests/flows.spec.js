import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function generate(page, { due='2024-02-04', dueTime='16:27', birth='2024-02-05', birthTime='12:00', avoided='' }={}) {
  await page.locator('[name=surname]').fill('林');
  await page.locator('.panel.active .next').click();
  await page.locator('[name=dueDate]').fill(due);
  if(dueTime) await page.locator('[name=dueTime]').fill(dueTime);
  if(birth) await page.locator('[name=birthDate]').fill(birth);
  if(birthTime) await page.locator('[name=birthTime]').fill(birthTime);
  await page.locator('[name=place]').fill('杭州');
  await page.locator('.panel.active .next').click();
  if(avoided) await page.locator('[name=avoidedChars]').fill(avoided);
  await page.locator('button[type=submit]').click();
  await expect(page.locator('#cards .card').first()).toBeVisible();
}

for(const width of [1280,390]) test(`四柱、预产期对照与报告在 ${width}px 可用`, async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/'); await generate(page,{avoided:'安、宁'});
  await expect(page.locator('.bazi-title')).toContainText('实际出生');
  await expect(page.locator('.bazi-comparison')).toContainText('靠近节气，需复核');
  await expect(page.locator('.bazi-comparison')).toContainText('预产期参考时刻');
  for(const name of await page.locator('#cards h3').allTextContents()) expect(name.slice(1)).not.toMatch(/[安宁]/);
  const pending=page.waitForEvent('download'); await page.locator('#downloadReport').click();
  const report=await readFile(await (await pending).path(),'utf8');
  expect(report).toContain('预产期参考四柱'); expect(report).toContain('预产期参考边界');
  await page.locator('#regenerate').click(); await expect(page.locator('#resultStatus')).toContainText('第 1 轮');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
});

test('旧收藏格式、图片和推荐链接保持兼容及隐私', async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('序名收藏',JSON.stringify(['林安']));
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copied=value;}}});
  });
  await page.goto('/?birthDate=2000-01-01&name=秘密#private');
  await page.locator('#savedButton').click(); await expect(page.locator('#savedList')).toContainText('林安');
  await generate(page,{}); const first=await page.locator('#cards h3').first().innerText();
  await page.locator('#cards .make-keepsake').first().click(); await expect(page.locator('#keepsakeName')).toHaveValue(first);
  const download=page.waitForEvent('download'); await page.locator('#downloadKeepsake').click();
  const image=await readFile(await (await download).path()); expect(image.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
  await page.locator('#copySiteLink').click();
  expect(await page.evaluate(()=>window.__copied)).toBe('http://127.0.0.1:4191/?utm_source=share&utm_medium=referral');
});

test('离线缓存可供本地心愿卡使用', async({page,context})=>{
  await page.goto('/'); await page.evaluate(()=>navigator.serviceWorker.ready); await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true); await page.reload(); await page.locator('#keepsakeName').fill('林知衡');
  const pending=page.waitForEvent('download');await page.locator('#downloadKeepsake').click();
  const image=await readFile(await (await pending).path());expect(image.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
});

test('减少动态效果、键盘及新生儿与改名切换', async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:320,height:850});await page.goto('/');
  await expect(page.locator('#currentNameField')).toBeHidden();
  expect(await page.evaluate(()=>getComputedStyle(document.querySelector('.orb'),'::before').animationName)).toBe('none');
  await page.locator('[name=purpose][value=rename]').focus();await page.keyboard.press('Space');
  await expect(page.locator('#currentNameField')).toBeVisible();await expect(page.locator('[name=mode][value=born]')).toBeChecked();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
});

test('升级后清理旧版本离线缓存', async({page})=>{
  await page.goto('/');
  await page.evaluate(async()=>{
    const registration=await navigator.serviceWorker.ready;
    await registration.unregister();
    const cache=await caches.open('xuming-mvp-v26');
    await cache.put('/old-private',new Response('old'));
  });
  await page.reload();
  await page.waitForFunction(async()=>!(await caches.keys()).includes('xuming-mvp-v26'));
  expect((await page.evaluate(()=>caches.keys())).some(key=>key.startsWith('xuming-react-'))).toBeTruthy();
});

test('候选为空、偏好冲突和服务不可用时给出清晰结果', async({page})=>{
  await page.goto('/');await page.locator('[name=surname]').fill('林');await page.locator('[name=length]').selectOption('1');
  await page.locator('.panel.active .next').click();await page.locator('[name=dueDate]').fill('2099-01-01');await page.locator('[name=place]').fill('杭州');await page.locator('.panel.active .next').click();
  await page.locator('[name=avoidedChars]').fill('安 澄 明 宁 远 知 衡 清 景 和 嘉 书 舒 川 若');
  await page.locator('button[type=submit]').click();await expect(page.locator('#cards .empty-result')).toBeVisible();await expect(page.locator('#downloadReport')).toBeDisabled();
  await page.locator('[name=likedChars]').fill('安');await page.locator('button[type=submit]').click();
  await expect(page.locator('#formMessage')).toContainText('不能重复');await expect(page.locator('#cards .card')).toHaveCount(0);
  await page.locator('[name=likedChars]').fill('');await page.route('**/api/analyze',route=>route.abort());
  await page.locator('button[type=submit]').click();await expect(page.locator('#formMessage')).toContainText('无法连接排盘服务');await expect(page.locator('#cards .card')).toHaveCount(0);
});

test('字库数量晚到时会同步修正数量上限', async({page})=>{
  await page.route('**/api/name-counts',async route=>{await new Promise(resolve=>setTimeout(resolve,700));await route.fulfill({json:{counts:{'1':15,'2':15,'3':5}}});});
  await page.goto('/');await page.locator('[name=length]').selectOption('3');await page.locator('[name=candidateCount]').fill('11');
  await expect(page.locator('[name=candidateCount]')).toHaveAttribute('max','5');await expect(page.locator('[name=candidateCount]')).toHaveValue('5');
});
