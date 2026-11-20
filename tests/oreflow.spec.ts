import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Открыть меню', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.nav-item').filter({ hasText: label }).click();
}

async function calculate(page: Page) {
  await page.getByRole('button', { name: 'Рассчитать схему', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Рассчитать схему', exact: true })).toBeEnabled();
}

test('planner responds to settings, resource compatibility and map controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Умная добыча.' })).toBeVisible();
  const initial = await page.locator('.result-number > span').first().textContent();
  await page.getByRole('button', { name: 'До', exact: true }).click();
  await expect(page.locator('.result-number > span').first()).not.toHaveText(initial!);
  await page.getByRole('button', { name: 'После', exact: true }).click();
  await page.getByRole('switch', { name: 'Подача воды', exact: true }).click();
  await expect(page.locator('.calculation-status')).toContainText('Параметры изменены');
  await calculate(page);
  await expect(page.locator('.block-extractor')).toHaveCount(0);
  await expect(page.locator('.result-number > span').first()).not.toHaveText(initial!);
  await page.getByRole('switch', { name: 'Электросеть', exact: true }).click();
  await calculate(page);
  await expect(page.locator('.planner-note')).toContainText('Нет питания');
  await page.getByRole('combobox', { name: 'Ресурс жилы' }).selectOption('thorium');
  await page.getByRole('combobox', { name: 'Тип бура' }).selectOption('mechanical');
  await calculate(page);
  await expect(page.locator('.planner-note')).toContainText('не может добывать');
  await page.getByRole('button', { name: 'Показать сетку', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Показать сетку', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Увеличить масштаб' }).click();
  await expect(page.locator('.map-zoom')).toContainText('125%');
  await page.getByRole('button', { name: 'Развернуть карту' }).click();
  await expect(page.locator('.map-fullscreen')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.map-fullscreen')).toHaveCount(0);
  await expect(page.locator('.map-frame')).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('saved plans survive reload, reopen correctly, export and delete', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Сохранить схему', exact: true }).click();
  await page.getByRole('textbox', { name: 'Название схемы' }).fill('Моя медная жила');
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить', exact: true }).click();
  await navigate(page, 'Мои схемы');
  await expect(page.getByRole('heading', { name: 'Моя медная жила' })).toBeVisible();
  await page.reload();
  await navigate(page, 'Мои схемы');
  await expect(page.getByRole('heading', { name: 'Моя медная жила' })).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспортировать Моя медная жила', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^oreflow-copper-.*\.json$/);
  await page.locator('.saved-plan-main').click();
  await expect(page.getByRole('heading', { name: 'Умная добыча.' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Тип бура' })).toHaveValue('laser');
  await navigate(page, 'Мои схемы');
  await page.getByRole('button', { name: 'Удалить Моя медная жила', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Хорошие планы стоит сохранять' })).toBeVisible();
});

test('idea filtering, search, favorites and local suggestions work', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Избранные идеи');
  await expect(page.locator('.idea-catalog-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Логистика', exact: true }).click();
  await expect(page.locator('.idea-catalog-item')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Убрать из избранного: Конвейер-навигатор', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Избранное', exact: true }).click();
  await expect(page.locator('.idea-catalog-item')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Конвейер-навигатор', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Найти идею' }).fill('ничего-нет');
  await expect(page.getByRole('heading', { name: 'Пока ничего не нашлось' })).toBeVisible();
  await page.getByRole('button', { name: 'Очистить поиск' }).click();
  await page.getByRole('button', { name: 'Своя идея', exact: true }).click();
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Умный ремонт стен');
  await page.getByRole('textbox', { name: 'Что будет делать мод?' }).fill('Находить повреждённые стены и планировать ремонт.');
  await page.getByRole('button', { name: 'Добавить идею', exact: true }).click();
  await expect(page.locator('.idea-catalog-item')).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Найти идею' }).fill('Умный ремонт стен');
  await expect(page.locator('.idea-catalog-item')).toHaveCount(1);
  await page.locator('.idea-preview').click();
  await expect(page.getByRole('dialog')).toContainText('не отправляется разработчикам');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await navigate(page, 'Избранные идеи');
  await expect(page.locator('.idea-catalog-item')).toHaveCount(2);
});

test('guide, honest concept disclosure and adaptive layout are available', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.map-frame')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: `artifacts/${testInfo.project.name}-verified.png`, fullPage: true });
  await navigate(page, 'Руководство');
  await expect(page.getByRole('heading', { name: 'От одного бура до целой жилы.' })).toBeVisible();
  await expect(page.locator('.faq-answer').first()).toContainText('готовый oreflow-mod-0.2.0.zip');
  await page.getByRole('button', { name: /Пластановый конвейер:/ }).click();
  await expect(page.locator('.faq-open .faq-answer')).toContainText('два отдельных загрузчика');
  await expect(page.getByRole('link', { name: /Официальная документация/ })).toHaveAttribute('href', 'https://mindustrygame.github.io/wiki/modding/1-modding/');
  await page.getByRole('button', { name: 'Попробовать планировщик', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Умная добыча.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('release downloads are real archives with checksums and native verification', async ({ page, request }) => {
  await page.goto('/');
  await navigate(page, 'Скачать мод');
  await expect(page.getByRole('heading', { name: 'Oreflow для твоей игры.' })).toBeVisible();
  const event = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Скачать мод', exact: false }).click();
  const download = await event;
  expect(download.suggestedFilename()).toBe('oreflow-mod-0.2.0.zip');
  const archive = await request.get('/downloads/oreflow-project-0.2.0.zip');
  expect(archive.ok()).toBe(true);
  expect((await archive.body()).subarray(0, 2).toString()).toBe('PK');
  const manifest = await (await request.get('/downloads/mod-manifest.json')).json();
  expect(manifest.sha256).toHaveLength(64);
  const verification = await (await request.get('/downloads/verification.json')).json();
  expect(verification.nativeEngines.every((engine: { status: string }) => engine.status === 'PASS')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
