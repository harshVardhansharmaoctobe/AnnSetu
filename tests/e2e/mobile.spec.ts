import { readFileSync } from 'fs';
import { expect, test } from '@playwright/test';

const fixture = () => JSON.parse(readFileSync('test-results/e2e-fixture.json', 'utf8')) as { adminEmail: string; adminPassword: string };

test.beforeEach(async ({ context }) => {
  await context.route('https://*.tile.openstreetmap.org/**', (route) => route.abort());
});

test('landing page fits a phone screen without horizontal scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join FoodBridge' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('dashboard navigation works through the mobile menu', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(fixture().adminEmail);
  await page.getByLabel('Password', { exact: true }).fill(fixture().adminPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard\/admin/);

  const toggle = page.getByTestId('menu-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await page.getByRole('navigation', { name: 'Dashboard' }).getByRole('link', { name: 'Users' }).click();
  await expect(page).toHaveURL(/\/dashboard\/admin\/users/);
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
