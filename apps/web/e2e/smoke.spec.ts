import { test, expect } from '@playwright/test';

test('landing page renders the main message', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /build less core/i })).toBeVisible();
  await expect(page.locator('[data-bee-layout="public.aurora"]')).toBeVisible();
  await expect(page.locator('[data-bee-slot="hero"]')).toBeVisible();
  await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
});

test('login route renders credential controls', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await expect(page.getByPlaceholder('Your password')).toBeVisible();
});

test('request access route works', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: /request access/i })).toBeVisible();
});

test('password recovery route works', async ({ page }) => {
  await page.goto('/forgot');
  await expect(page.getByRole('heading', { name: /reset password/i })).toBeVisible();
});

test('dashboard displays unauthenticated guard', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /session required/i })).toBeVisible();
});


test('template manager keeps public and dashboard themes independent', async ({ page }) => {
  await page.goto('/');
  const manager = page.getByRole('region', { name: 'Template manager' });
  await expect(manager).toBeVisible();
  await manager.getByLabel('Public website').selectOption('editorial');
  await expect(page.locator('body')).toHaveAttribute('data-bee-public-template', 'editorial');
  await expect(page.locator('[data-bee-layout="public.editorial"]')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-bee-dashboard-template', 'midnight');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-bee-public-template', 'editorial');
  await expect(manager.getByLabel('Public website')).toHaveValue('editorial');
});

test('dashboard template can be selected without changing public theme', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bee-auth', JSON.stringify({ user: { email: 'test@example.com' }, accessToken: 'test' })));
  await page.goto('/dashboard');
  const manager = page.getByRole('region', { name: 'Template manager' });
  await expect(manager).toBeVisible();
  await manager.getByLabel('Dashboard').selectOption('paper');
  await expect(page.locator('body')).toHaveAttribute('data-bee-dashboard-template', 'paper');
  await expect(page.locator('[data-bee-layout="dashboard.paper"]')).toBeVisible();
  await expect(page.locator('[data-bee-slot="sidebar"]')).toBeVisible();
  await expect(page.locator('[data-bee-slot="widgets"]')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-bee-public-template', 'aurora');
});
