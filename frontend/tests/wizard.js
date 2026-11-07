import {expect} from '@playwright/test';
export async function basic(page) {
  const panel=page.locator('.basic-info');
  if(!await panel.isVisible())await page.locator('.naming-steps button').nth(0).click();
}
export async function birth(page) {
  const panel=page.locator('.birth-info');
  if(await panel.isVisible())return;
  const target=page.locator('.naming-steps button').nth(1);
  if(await target.isEnabled())await target.click();
  else await page.getByRole('button',{name:'下一步：出生信息',exact:true}).click();
  await expect(panel).toBeVisible();
}
export async function preferences(page) {
  if(await page.locator('.naming-preferences').isVisible())return;
  const target=page.locator('.naming-steps button').nth(2);
  if(await target.isEnabled())await target.click();
  else {await birth(page);await page.getByRole('button',{name:'下一步：心意偏好',exact:true}).click();}
  await expect(page.locator('.naming-preferences')).toBeVisible();
}
export async function submitNaming(page) {
  for(let count=0;count<3;count++) {
    const action=page.locator('#namingForm button[type=submit]');
    const label=await action.textContent();
    const before=await page.locator('.naming-steps [aria-current=step]').textContent();
    await action.click();
    if(!label.includes('下一步'))return;
    const after=await page.locator('.naming-steps [aria-current=step]').textContent();
    if(before===after)return;
  }
}
