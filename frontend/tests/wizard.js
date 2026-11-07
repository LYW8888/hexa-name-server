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
  await birth(page);
  const details=page.locator('.naming-preferences');
  if(!await details.evaluate(el=>el.open))await details.locator(':scope > summary').click();
  await expect(page.locator('[name=length]')).toBeVisible();
}
export async function location(page) {
  await birth(page);
  const details=page.locator('.birth-location');
  if(!await details.evaluate(el=>el.open))await details.locator(':scope > summary').click();
  await expect(page.locator('[name=place]')).toBeVisible();
}
export async function submitNaming(page) {
  for(let count=0;count<2;count++) {
    const action=page.locator('#namingForm button[type=submit]');
    const label=await action.textContent();
    const before=await page.locator('.naming-steps [aria-current=step]').textContent();
    await action.click();
    if(!label.includes('下一步'))return;
    const after=await page.locator('.naming-steps [aria-current=step]').textContent();
    if(before===after)return;
  }
}
