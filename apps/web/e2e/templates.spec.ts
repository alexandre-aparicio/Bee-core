import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dashboardTemplates = ['midnight', 'paper', 'glass'];
const publicTemplates = ['aurora', 'editorial', 'studio'];
const modes = ['light', 'dark'];
const allTemplates = ['aurora', 'editorial', 'studio', 'midnight', 'paper', 'glass'];

test.setTimeout(60000);

function packageBg(template, target, mode) {
  const path = resolve(process.cwd(), 'src/app/templates/packages/' + template + '/tokens.css');
  const source = readFileSync(path, 'utf8');
  const marker = 'data-bee-' + target + '-mode="' + mode + '"';
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error('Missing ' + template + ' ' + mode + ' token selector');
  const open = source.indexOf('{', markerIndex);
  const close = source.indexOf('}', open);
  const match = source.slice(open, close).match(/--bee-bg:\s*([^;]+);/);
  if (!match) throw new Error('Missing --bee-bg in ' + template + ' ' + mode);
  return match[1].trim();
}

async function seed(page, target, template, mode) {
  await page.addInitScript(({ target, template, mode }) => {
    const selection = {
      public: target === 'public' ? template : 'aurora',
      dashboard: target === 'dashboard' ? template : 'midnight'
    };
    localStorage.setItem('bee-template-selection', JSON.stringify(selection));
    localStorage.setItem('bee-template-mode:' + target + ':' + template + ':host-localhost', mode);
    if (target === 'dashboard') {
      localStorage.setItem('bee-template-mode:dashboard:' + template + ':tenant-demo', mode);
      localStorage.setItem('bee-auth', JSON.stringify({
        accessToken: 'template-e2e-admin-token',
        tenantId: 'tenant-demo',
        user: { id: 'user-demo', email: 'admin@example.test', roles: ['admin'], tenantId: 'tenant-demo' }
      }));
    } else {
      localStorage.removeItem('bee-auth');
    }
  }, { target, template, mode });
}

async function mockApi(page, selection) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body = {};
    if (path.endsWith('/api/auth/refresh')) {
      body = { accessToken: 'template-e2e-admin-token', tenantId: 'tenant-demo', platformRole: null, user: { id: 'user-demo', email: 'admin@example.test', roles: ['admin'], tenantId: 'tenant-demo' } };
    } else if (path.endsWith('/api/auth/me')) {
      body = { authenticated: true, tenantId: 'tenant-demo', platformRole: null };
    } else if (path.endsWith('/api/companies')) {
      body = { companies: [{ id: 'tenant-demo', name: 'Demo Workspace', role: 'owner', active: true }] };
    } else if (path.endsWith('/api/marketplace/plugins')) {
      body = {
        tenantId: 'tenant-demo',
        plugins: [
          { id: 'documents', pluginKey: 'documents', installed: true, enabled: true, entitled: true },
          { id: 'connected-devices', pluginKey: 'connected-devices', installed: true, enabled: true, entitled: true },
          { id: 'time-tracking', pluginKey: 'time-tracking', installed: true, enabled: true, entitled: true }
        ]
      };
    } else if (path.endsWith('/api/templates/preferences') || path.endsWith('/api/templates/public')) {
      body = { selection, installedTemplates: allTemplates };
    } else if (path.endsWith('/api/public/tenant')) {
      body = { kind: 'corporate' };
    } else if (path.endsWith('/api/public/tenant/plugins')) {
      body = { pluginIds: [] };
    } else if (path.endsWith('/api/public/platform-identity')) {
      body = { brand: { platformName: 'Bee-Core' } };
    } else if (path.endsWith('/api/templates/stream-ticket') || path.endsWith('/api/templates/public-stream-ticket')) {
      body = { ticket: null };
    } else if (path.endsWith('/api/i18n/preferences') || path.endsWith('/api/users/me/preferences')) {
      body = { locale: 'en' };
    } else if (path.endsWith('/api/notifications')) {
      body = { notifications: [] };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function openDashboard(page, template, mode, path) {
  await seed(page, 'dashboard', template, mode);
  await mockApi(page, { public: 'aurora', dashboard: template });
  await page.goto(path || '/dashboard');
  await expect(page.locator('html')).toHaveAttribute('data-bee-active-template', template);
  await expect(page.locator('html')).toHaveAttribute('data-bee-active-mode', mode);
  await expect(page.locator('.bee-dash-main')).toBeVisible();
}

async function openLogin(page, template, mode) {
  await seed(page, 'dashboard', template, mode);
  await mockApi(page, { public: 'aurora', dashboard: template });
  await page.goto('/login');
  await expect(page.locator('.auth-page')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-bee-active-template', template);
  await expect(page.locator('html')).toHaveAttribute('data-bee-active-mode', mode);
}

async function openPublic(page, template, mode) {
  await seed(page, 'public', template, mode);
  await mockApi(page, { public: template, dashboard: 'midnight' });
  await page.goto('/');
  await expect(page.locator('[data-bee-layout="public.' + template + '"]')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-bee-active-template', template);
  await expect(page.locator('html')).toHaveAttribute('data-bee-active-mode', mode);
}

async function assertActiveToken(page, template, target, mode) {
  const expected = packageBg(template, target, mode);
  const rootValue = await page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--bee-bg').trim());
  expect(rootValue).toBe(expected);
  const host = page.locator('.bee-template-package-host--' + template).first();
  await expect(host).toHaveCount(1);
  const hostValue = await host.evaluate(node => getComputedStyle(node).getPropertyValue('--bee-bg').trim());
  expect(hostValue).toBe(expected);
}

async function assertNoUntokenedDefaults(page, mainSelector) {
  const offenders = await page.locator(mainSelector).evaluate(main => {
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    const allowed = ['--bee-bg', '--bee-surface', '--bee-surface-raised', '--bee-input-bg', '--bee-qr-light']
      .map(token => {
        probe.style.backgroundColor = 'var(' + token + ')';
        return getComputedStyle(probe).backgroundColor;
      });
    probe.remove();
    const defaults = new Set(['rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
    return Array.from(main.querySelectorAll('*'))
      .filter(element => {
        const color = getComputedStyle(element).backgroundColor;
        return defaults.has(color) && !allowed.includes(color);
      })
      .map(element => element.tagName.toLowerCase() + '.' + String(element.className || '').toString().replace(/\s+/g, '.'))
      .slice(0, 12);
  });
  expect(offenders).toEqual([]);
}

async function saveScreenshot(page, target, template, mode, screen) {
  await page.screenshot({
    path: 'test-results/template-screenshots/' + target + '-' + template + '-' + mode + '-' + screen + '.png',
    fullPage: true,
    animations: 'disabled'
  });
}

test('each template exposes a distinct --bee-bg for both modes', () => {
  for (const mode of modes) {
    const dashboardValues = dashboardTemplates.map(id => packageBg(id, 'dashboard', mode));
    const publicValues = publicTemplates.map(id => packageBg(id, 'public', mode));
    expect(new Set(dashboardValues).size).toBe(dashboardTemplates.length);
    expect(new Set(publicValues).size).toBe(publicTemplates.length);
  }
});

for (const template of dashboardTemplates) {
  for (const mode of modes) {
    test('dashboard ' + template + ' ' + mode + ': active surface, independent mode and screenshots', async ({ page }) => {
      await openDashboard(page, template, mode, '/dashboard');
      await expect(page.locator('body')).toHaveAttribute('data-bee-dashboard-template', template);
      await assertActiveToken(page, template, 'dashboard', mode);
      await assertNoUntokenedDefaults(page, '.bee-dash-content');
      await saveScreenshot(page, 'dashboard', template, mode, 'dashboard-home');

      const dashboardScreens = [
        { name: 'settings', path: '/dashboard/settings/general' },
        { name: 'organization-roles', path: '/dashboard/organization/roles' },
        { name: 'plugin-settings', path: '/dashboard/settings/plugins' },
        { name: 'documents', path: '/dashboard/documents' }
      ];
      for (const screen of dashboardScreens) {
        await page.goto(screen.path);
        await expect(page.locator('html')).toHaveAttribute('data-bee-active-template', template);
        await expect(page.locator('html')).toHaveAttribute('data-bee-active-mode', mode);
        await expect(page.locator('.bee-dash-main')).toBeVisible();
        await saveScreenshot(page, 'dashboard', template, mode, screen.name);
      }

      await openLogin(page, template, mode);
      await saveScreenshot(page, 'dashboard', template, mode, 'login');

      await openDashboard(page, template, mode, '/dashboard');
      const publicModeBefore = await page.locator('body').getAttribute('data-bee-public-mode');
      const initialBg = await page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--bee-bg').trim());
      let mainFrameNavigations = 0;
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) mainFrameNavigations += 1; });
      const navigationsBefore = mainFrameNavigations;
      await page.locator('.bee-dash-theme-toggle').click();
      const nextMode = mode === 'dark' ? 'light' : 'dark';
      await expect(page.locator('html')).toHaveAttribute('data-bee-active-mode', nextMode);
      const nextBg = await page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--bee-bg').trim());
      expect(nextBg).not.toBe(initialBg);
      expect(await page.locator('body').getAttribute('data-bee-public-mode')).toBe(publicModeBefore);
      expect(mainFrameNavigations).toBe(navigationsBefore);
    });
  }
}

for (const template of publicTemplates) {
  for (const mode of modes) {
    test('public ' + template + ' ' + mode + ': active surface, independent mode and screenshot', async ({ page }) => {
      await openPublic(page, template, mode);
      await assertActiveToken(page, template, 'public', mode);
      await assertNoUntokenedDefaults(page, '[data-bee-layout="public.' + template + '"] main');
      await saveScreenshot(page, 'public', template, mode, 'public-home');

      const dashboardModeBefore = await page.locator('body').getAttribute('data-bee-dashboard-mode');
      const initialBg = await page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--bee-bg').trim());
      let mainFrameNavigations = 0;
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) mainFrameNavigations += 1; });
      const navigationsBefore = mainFrameNavigations;
      const toggle = page.locator('[data-bee-layout="public.' + template + '"] button').filter({ hasText: /light|dark|theme/i }).first();
      await expect(toggle).toBeVisible();
      await toggle.click();
      const nextMode = mode === 'dark' ? 'light' : 'dark';
      await expect(page.locator('html')).toHaveAttribute('data-bee-active-mode', nextMode);
      const nextBg = await page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--bee-bg').trim());
      expect(nextBg).not.toBe(initialBg);
      expect(await page.locator('body').getAttribute('data-bee-dashboard-mode')).toBe(dashboardModeBefore);
      expect(mainFrameNavigations).toBe(navigationsBefore);
    });
  }
}
