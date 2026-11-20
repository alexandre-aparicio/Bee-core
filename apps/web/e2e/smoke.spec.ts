import { test, expect } from '@playwright/test';

test('landing page renders the main message', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /build less core/i })).toBeVisible();
  await expect(page.locator('[data-bee-layout="public.aurora"]')).toBeVisible();
  await expect(page.locator('[data-bee-slot="hero"]')).toHaveCount(1);
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
  await page.addInitScript(() => localStorage.setItem('bee-auth', JSON.stringify({ user: { email: 'test@example.com', roles: ['admin'], tenantId: 'tenant-test' }, accessToken: 'test' })));
  await page.goto('/dashboard');
  const manager = page.getByRole('region', { name: 'Template manager' });
  await expect(manager).toBeVisible();
  await manager.getByLabel('Dashboard').selectOption('paper');
  await expect(page.locator('body')).toHaveAttribute('data-bee-dashboard-template', 'paper');
  await expect(page.locator('[data-bee-layout="dashboard.paper"]')).toBeVisible();
  await expect(manager.getByText('Preview only')).toBeVisible();
  await manager.getByRole('button', { name: 'Discard preview' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-bee-dashboard-template', 'midnight');
  await manager.getByLabel('Dashboard').selectOption('paper');
  await manager.getByRole('button', { name: 'Apply template changes' }).click();
  await expect(page.locator('[data-bee-slot="sidebar"]')).toHaveCount(1);
  await expect(page.locator('[data-bee-slot="widgets"]')).toHaveCount(1);
  await expect(page.locator('body')).toHaveAttribute('data-bee-public-template', 'aurora');
});


test('public tenant template and design tokens hot-load from the request domain', async ({ page }) => {
  await page.route('**/api/templates/public', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      tenantId: 'tenant-demo',
      selection: { public: 'editorial', dashboard: 'paper' },
      tokens: { '--bg': '#112233', '--purple': '#abcdef' },
      customized: true
    })
  }));
  await page.goto('/');
  await expect(page.locator('[data-bee-layout="public.editorial"]')).toBeVisible();
  await expect.poll(() => page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--bg').trim())).toBe('#112233');
  await expect.poll(() => page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--purple').trim())).toBe('#abcdef');
});


test('tenant admin can install and activate a trusted dashboard template package', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bee-auth', JSON.stringify({
    accessToken: 'test-admin-token',
    user: { email: 'admin@example.test', roles: ['admin'], tenantId: 'tenant-demo' }
  })));
  await page.route('**/api/templates/preferences', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ selection: { public: 'aurora', dashboard: 'midnight' }, installedTemplates: ['aurora', 'editorial', 'midnight', 'paper'] })
  }));
  await page.route('**/api/templates/theme', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ tokens: { '--bg': '#080a12', '--panel': '#10131e', '--muted': '#8991a4', '--border': '#303447', '--purple': '#8c72ff', '--cyan': '#69e5d4' }, customized: false })
  }));
  await page.route('**/api/templates/stream-ticket', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ticket: 'one-use-test-ticket' })
  }));
  await page.route('**/api/templates/install', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ installedTemplates: ['aurora', 'editorial', 'midnight', 'paper', 'glass'] })
  }));
  await page.goto('/dashboard');
  const manager = page.getByRole('region', { name: 'Template manager' });
  await expect(manager).toBeVisible();
  await manager.locator('.bee-template-package').filter({ hasText: 'Glass' }).getByRole('button', { name: 'Install' }).click();
  await expect(manager.getByText('Package installed for this tenant.')).toBeVisible();
  await manager.getByLabel('Dashboard').selectOption('glass');
  await expect(page.locator('[data-bee-layout="dashboard.glass"]')).toBeVisible();
  await manager.getByRole('button', { name: 'Apply template changes' }).click();
});
