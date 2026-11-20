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
  await page.route('**/api/templates/theme', route => {
    const tokens = route.request().method() === 'PUT'
      ? { '--bg': '#101827', '--panel': '#1b2940', '--muted': '#a2b1c7', '--border': '#40516b', '--purple': '#8b9dff', '--cyan': '#69d9e8' }
      : { '--bg': '#080a12', '--panel': '#10131e', '--muted': '#8991a4', '--border': '#303447', '--purple': '#8c72ff', '--cyan': '#69e5d4' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tokens, customized: route.request().method() === 'PUT' }) });
  });
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
  await expect.poll(() => page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--bg').trim())).toBe('#101827');
  await manager.getByRole('button', { name: 'Discard preview' }).click();
  await expect(page.locator('[data-bee-layout="dashboard.midnight"]')).toBeVisible();
  await expect.poll(() => page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--bg').trim())).toBe('#080a12');
  await manager.getByLabel('Dashboard').selectOption('glass');
  await manager.getByRole('button', { name: 'Apply template changes' }).click();
  await expect.poll(() => page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--bg').trim())).toBe('#101827');
});


test('dashboard company selector switches the active tenant session', async ({ page }) => {
  let activeCompany = 'company-a';
  let companyListRequests = 0;
  await page.addInitScript(() => {
    if (!localStorage.getItem('bee-auth')) localStorage.setItem('bee-auth', JSON.stringify({
      accessToken: 'company-a-token',
      tenantId: 'company-a',
      user: { id: 'user-1', email: 'owner@example.test', roles: ['admin'], tenantId: 'company-a' }
    }));
  });
  await page.route('**/api/companies', route => {
    companyListRequests += 1;
    return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ companies: [
      { id: 'company-a', name: 'Company A', role: 'owner', active: activeCompany === 'company-a' },
      { id: 'company-b', name: 'Company B', role: 'manager', active: activeCompany === 'company-b' }
    ] })
  });
  });
  await page.route('**/api/companies/company-b/activate', route => {
    activeCompany = 'company-b';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'company-b-token', tenantId: 'company-b', membership: { role: 'manager' } })
    });
  });
  await page.goto('/dashboard');
  const selector = page.getByLabel('Active company');
  await expect(selector).toHaveValue('company-a');
  const activation = page.waitForResponse(response => response.url().includes('/api/companies/company-b/activate'));
  await selector.selectOption('company-b');
  const activationResponse = await activation;
  expect(activationResponse.status()).toBe(200);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('bee-auth') || '{}').tenantId === 'company-b');
  await expect.poll(() => companyListRequests).toBeGreaterThan(1);
  await expect(page.getByLabel('Active company')).toHaveValue('company-b');
});


test('dashboard marketplace shows company packages and installs an entitled plugin', async ({ page }) => {
  let notesInstalled = false;
  await page.addInitScript(() => {
    if (!localStorage.getItem('bee-auth')) localStorage.setItem('bee-auth', JSON.stringify({
      accessToken: 'marketplace-token',
      tenantId: 'company-pro',
      user: { id: 'owner-1', email: 'owner@example.test', roles: ['admin'], tenantId: 'company-pro' }
    }));
  });
  await page.route('**/api/companies', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ companies: [{ id: 'company-pro', name: 'Company Pro', role: 'owner', active: true }] })
  }));
  await page.route('**/api/marketplace/plugins', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ tenantId: 'company-pro', plugins: [
      { id: 'files', name: 'Private Files', version: '0.1.0', description: 'Private company file and image storage', category: 'platform', system: true, entitled: true, accessSource: 'plan', installed: true },
      { id: 'notes', name: 'Team Notes', version: '0.1.0', description: 'Company-scoped team notes', category: 'productivity', system: false, entitled: true, accessSource: 'plan', installed: notesInstalled }
    ] })
  }));
  await page.route('**/api/marketplace/plugins/notes/install', route => {
    if (route.request().method() === 'POST') {
      notesInstalled = true;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ pluginId: 'notes', status: 'installed', version: '0.1.0' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pluginId: 'notes', status: 'uninstalled', dataPreserved: true }) });
  });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Company plugin marketplace' })).toBeVisible();
  await expect(page.getByText('Private Files')).toBeVisible();
  await expect(page.locator('.bee-marketplace__item').filter({ hasText: 'Team Notes' })).toBeVisible();
  await page.getByRole('button', { name: 'Install' }).click();
  await expect(page.getByText('Team Notes installed for this company.')).toBeVisible();
  await expect(page.locator('.bee-marketplace__item').filter({ hasText: 'Team Notes' }).getByText('Installed', { exact: true })).toBeVisible();
});


test('starter company sees purchasable add-ons but cannot install them without entitlement or role', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('bee-auth')) localStorage.setItem('bee-auth', JSON.stringify({
      accessToken: 'starter-member-token',
      tenantId: 'company-starter',
      user: { id: 'member-1', email: 'member@example.test', roles: ['user'], tenantId: 'company-starter' }
    }));
  });
  await page.route('**/api/companies', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ companies: [{ id: 'company-starter', name: 'Starter Company', role: 'member', active: true }] })
  }));
  await page.route('**/api/marketplace/plugins', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ tenantId: 'company-starter', plugins: [
      { id: 'files', name: 'Private Files', version: '0.1.0', description: 'Private company file and image storage', category: 'platform', system: true, entitled: true, accessSource: 'plan', installed: true, purchasable: false },
      { id: 'notes', name: 'Team Notes', version: '0.1.0', description: 'Company-scoped team notes', category: 'productivity', system: false, entitled: false, accessSource: null, installed: false, purchasable: true }
    ] })
  }));
  await page.goto('/dashboard');
  const notesRow = page.locator('.bee-marketplace__item').filter({ hasText: 'Team Notes' });
  await expect(notesRow).toBeVisible();
  await expect(notesRow.getByText('Available as add-on')).toBeVisible();
  await expect(notesRow.getByRole('button', { name: 'Install' })).toHaveCount(0);
});
