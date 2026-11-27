import { test, expect } from './quality-gates';

type SessionFixture = {
  accessToken: string;
  tenantId?: string;
  platformRole?: string;
  user: { id?: string; email?: string; roles?: string[]; tenantId?: string; platformRole?: string };
};

async function setSessionFixture(page: Page, session: SessionFixture): Promise<void> {
  const serialized = JSON.stringify(session);
  await page.context().addCookies([{
    name: 'bee-test-auth',
    value: encodeURIComponent(serialized),
    url: 'http://127.0.0.1:4200',
    sameSite: 'Lax'
  }]);
  await page.addInitScript((value: string) => localStorage.setItem('bee-auth', value), serialized);
}

test.beforeEach(async ({ page }) => {
  const readSessionFixture = async (request: { allHeaders(): Promise<Record<string, string>> }) => {
    const cookie = (await request.allHeaders()).cookie || '';
    const fixture = cookie.split(';').map(part => part.trim()).find(part => part.startsWith('bee-test-auth='));
    try {
      return fixture
        ? JSON.parse(decodeURIComponent(fixture.slice('bee-test-auth='.length))) as {
            accessToken?: string;
            tenantId?: string;
            user?: { tenantId?: string; roles?: string[] };
            platformRole?: string;
          }
        : {};
    } catch {
      return {};
    }
  };

  await page.route('**/api/auth/refresh', async route => {
    const session = await readSessionFixture(route.request());
    if (!session.accessToken) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'No test session fixture' })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: session.accessToken,
        tenantId: session.tenantId || session.user?.tenantId,
        user: session.user,
        platformRole: session.platformRole
      })
    });
  });

  await page.route('**/api/auth/me', async route => {
    const token = route.request().headers().authorization || '';
    const session = await readSessionFixture(route.request());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        tenantId: session.tenantId || session.user?.tenantId || 'tenant-demo',
        platformRole: token === 'Bearer platform-admin-token' ? 'superadmin' : session.platformRole || null
      })
    });
  });

  // The default test host represents the platform's corporate website.
  await page.route('**/api/public/tenant', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ kind: 'corporate' })
  }));
  // Supply a valid active tenant for scenarios that do not define their own company fixture.
  await page.route('**/api/companies', async route => {
    const session = await readSessionFixture(route.request());
    const tenantId = session.tenantId || session.user?.tenantId || 'tenant-demo';
    const role = session.user?.roles?.includes('admin') ? 'owner' : 'member';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ companies: [{ id: tenantId, name: 'Test Company', role, active: true }] })
    });
  });
  await page.route('**/api/companies/active/permissions', async route => {
    const session = await readSessionFixture(route.request());
    const permissions = session.user?.roles?.includes('admin')
      ? ['members.read', 'members.manage', 'members.invite']
      : ['members.read'];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ permissions }) });
  });
  await page.route('**/api/companies/*/roles', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ roles: [] })
  }));
});

test('landing page renders the main message', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /build less core/i })).toBeVisible();
  await expect(page.locator('[data-bee-layout="public.aurora"]')).toBeVisible();
  await expect(page.locator('.hero')).toHaveCount(1);
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

test('dashboard redirects unauthenticated visitors to the visible login page', async ({ page }) => {
  await page.goto('/dashboard');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login');
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
});


test('template manager keeps public and dashboard themes independent', async ({ page }) => {
  let selection = { public: 'aurora', dashboard: 'midnight' };
  await setSessionFixture(page, {
    accessToken: 'template-admin-token',
    tenantId: 'tenant-demo',
    user: { id: 'admin-1', email: 'admin@example.test', roles: ['admin'], tenantId: 'tenant-demo' }
  });
  await page.route('**/api/templates/preferences', route => {
    if (route.request().method() === 'PUT') selection = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ selection, installedTemplates: ['aurora', 'editorial', 'midnight', 'paper'] }) });
  });
  await page.route('**/api/templates/stream-ticket', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }));
  await page.goto('/dashboard/settings/general');
  const manager = page.getByRole('region', { name: 'Template manager' });
  await expect(manager).toBeVisible();
  await manager.getByLabel('Public website template').selectOption('editorial');
  await expect(page.locator('body')).toHaveAttribute('data-bee-public-template', 'editorial');
  await expect(page.locator('.bee-template-package-host--midnight')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-bee-dashboard-template', 'midnight');
  await manager.getByRole('button', { name: 'Apply template' }).click();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-bee-public-template', 'editorial');
  await expect(manager.getByLabel('Public website template')).toHaveValue('editorial');
});

test('dashboard template can be selected without changing public theme', async ({ page }) => {
  let selection = { public: 'aurora', dashboard: 'midnight' };
  await setSessionFixture(page, { user: { email: 'test@example.com', roles: ['admin'], tenantId: 'tenant-test' }, accessToken: 'test', tenantId: 'tenant-test' });
  await page.route('**/api/templates/preferences', route => {
    if (route.request().method() === 'PUT') selection = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ selection, installedTemplates: ['aurora', 'editorial', 'midnight', 'paper'] }) });
  });
  await page.route('**/api/templates/stream-ticket', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }));
  await page.goto('/dashboard/settings/general');
  const manager = page.getByRole('region', { name: 'Template manager' });
  await expect(manager).toBeVisible();
  await manager.getByLabel('Dashboard template').selectOption('paper');
  await expect(page.locator('body')).toHaveAttribute('data-bee-dashboard-template', 'paper');
  await expect(page.locator('.bee-template-package-host--paper')).toBeVisible();
  await expect(manager.getByText('Preview only')).toBeVisible();
  await manager.getByRole('button', { name: 'Discard' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-bee-dashboard-template', 'midnight');
  await manager.getByLabel('Dashboard template').selectOption('paper');
  await manager.getByRole('button', { name: 'Apply template' }).click();
  await page.goto('/dashboard');
  await expect(page.locator('[data-bee-slot="sidebar"]')).toHaveCount(1);
  await expect(page.locator('[data-bee-slot="widgets"]')).toHaveCount(1);
  await expect(page.locator('body')).toHaveAttribute('data-bee-public-template', 'aurora');
});


test('legacy public theme token payloads are ignored while template selection is restored', async ({ page }) => {
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
  await expect(page.locator('html')).toHaveAttribute('data-bee-active-template', 'editorial');
  await expect(page.locator('html')).toHaveAttribute('data-bee-active-mode', 'light');
  await expect.poll(() => page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--bee-bg').trim())).toBe('#f6f7fb');
});

test('tenant admin can install and activate a trusted dashboard template package', async ({ page }) => {
  await setSessionFixture(page, {
    accessToken: 'test-admin-token',
    user: { email: 'admin@example.test', roles: ['admin'], tenantId: 'tenant-demo' }
  });
  await page.route('**/api/templates/preferences', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ selection: { public: 'aurora', dashboard: 'midnight' }, installedTemplates: ['aurora', 'editorial', 'midnight', 'paper'] })
  }));
  await page.route('**/api/templates/stream-ticket', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ticket: 'one-use-test-ticket' })
  }));
  await page.route('**/api/templates/install', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ installedTemplates: ['aurora', 'editorial', 'midnight', 'paper', 'glass'] })
  }));
  await page.goto('/dashboard/settings/general');
  const manager = page.getByRole('region', { name: 'Template manager' });
  await expect(manager).toBeVisible();
  await manager.locator('.bee-template-package').filter({ hasText: 'Glass' }).getByRole('button', { name: 'Install' }).click();
  await expect(manager.getByText('Template installed for this company.')).toBeVisible();
  await manager.getByLabel('Dashboard template').selectOption('glass');
  await expect(page.locator('.bee-template-package-host--glass')).toBeVisible();
  await expect.poll(() => page.locator('.bee-template-package-host--glass').evaluate(node => getComputedStyle(node).getPropertyValue('--bee-bg').trim())).toBe('#101827');
  await manager.getByRole('button', { name: 'Discard' }).click();
  await expect(page.locator('.bee-template-package-host--midnight')).toBeVisible();
  await expect.poll(() => page.locator('.bee-template-package-host--midnight').evaluate(node => getComputedStyle(node).getPropertyValue('--bee-bg').trim())).toBe('#080a12');
  await manager.getByLabel('Dashboard template').selectOption('glass');
  await manager.getByRole('button', { name: 'Apply template' }).click();
  await expect.poll(() => page.locator('.bee-template-package-host--glass').evaluate(node => getComputedStyle(node).getPropertyValue('--bee-bg').trim())).toBe('#101827');
});


test('dashboard company selector switches the active tenant session', async ({ page }) => {
  let activeCompany = 'company-a';
  let companyListRequests = 0;
  await setSessionFixture(page, {
    accessToken: 'company-a-token',
    tenantId: 'company-a',
    user: { id: 'user-1', email: 'owner@example.test', roles: ['admin'], tenantId: 'company-a' }
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
  await expect.poll(() => companyListRequests).toBeGreaterThan(1);
  await expect(page.getByLabel('Active company')).toHaveValue('company-b');
});


test('dashboard marketplace installs an entitled package and keeps workspace data company-scoped', async ({ page }) => {
  let workspaceInstalled = false;
  const items: Array<{id:string;title:string;content:string;createdBy:string;createdAt:string;updatedAt:string}> = [];
  await setSessionFixture(page, {
    accessToken: 'marketplace-token',
    tenantId: 'company-pro',
    user: { id: 'owner-1', email: 'owner@example.test', roles: ['admin'], tenantId: 'company-pro' }
  });
  await page.route('**/api/companies', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ companies: [{ id: 'company-pro', name: 'Company Pro', role: 'owner', active: true }] })
  }));
  await page.route('**/api/marketplace/plugins', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ tenantId: 'company-pro', plugins: [
      { id: 'files', name: 'Private Files', version: '0.1.0', description: 'Private company file and image storage', category: 'platform', system: true, entitled: true, accessSource: 'plan', installed: true },
      { id: 'workspace', name: 'Team Workspace', version: '0.1.0', description: 'Company-scoped workspace items', category: 'productivity', system: false, entitled: true, accessSource: 'plan', installed: workspaceInstalled, enabled: workspaceInstalled }
    ] })
  }));
  await page.route('**/api/workspace-items', route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items }) });
    const body = route.request().postDataJSON();
    const now = new Date().toISOString();
    const item = { id: 'item-' + (items.length + 1), title: body.title, content: body.content, createdBy: 'owner-1', createdAt: now, updatedAt: now };
    items.push(item);
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ item }) });
  });
  await page.route('**/api/marketplace/plugins/workspace/install', route => {
    if (route.request().method() === 'POST') {
      workspaceInstalled = true;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ pluginId: 'workspace', status: 'installed', version: '0.1.0' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pluginId: 'workspace', status: 'uninstalled', dataPreserved: true }) });
  });
  await page.goto('/dashboard');
  await page.getByRole('main').getByRole('button', { name: /manage plugins/i }).click();
  await expect(page.getByRole('heading', { name: 'Company plugin marketplace' })).toBeVisible();
  await expect(page.getByText('Private Files')).toBeVisible();
  const workspaceRow = page.locator('.bee-marketplace__item').filter({ hasText: 'Team Workspace' });
  await expect(workspaceRow).toBeVisible();
  await workspaceRow.getByRole('button', { name: 'Install' }).click();
  await expect(page.getByText('Team Workspace installed for this company.')).toBeVisible();
  await expect(page.locator('.bee-marketplace__item').filter({ hasText: 'Team Workspace' }).getByText('Installed', { exact: true })).toBeVisible();
  const result = await page.evaluate(async () => {
    await fetch('/api/workspace-items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Quarterly planning', content: 'Private workspace data for Company Pro' }) });
    return fetch('/api/workspace-items').then(response => response.json());
  });
  expect(result.items).toHaveLength(1);
  expect(result.items[0].title).toBe('Quarterly planning');
  expect(result.items[0].content).toContain('Company Pro');
});


test('starter company sees purchasable add-ons but cannot install them without entitlement or role', async ({ page }) => {
  await setSessionFixture(page, {
    accessToken: 'starter-member-token',
    tenantId: 'company-starter',
    user: { id: 'member-1', email: 'member@example.test', roles: ['user'], tenantId: 'company-starter' }
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
      { id: 'sample-addon', name: 'Sample Add-on', version: '0.1.0', description: 'Optional company package', category: 'productivity', system: false, entitled: false, accessSource: null, installed: false, purchasable: true }
    ] })
  }));
  await page.goto('/dashboard');
  await page.getByRole('main').getByRole('button', { name: /manage plugins/i }).click();
  const addOnRow = page.locator('.bee-marketplace__item').filter({ hasText: 'Sample Add-on' });
  await expect(addOnRow).toBeVisible();
  await expect(addOnRow.getByText('Available as add-on')).toBeVisible();
  await expect(addOnRow.getByRole('button', { name: 'Install' })).toHaveCount(0);
});


test('company owner can invite, change roles and suspend company members', async ({ page }) => {
  const members = [
    { userId: 'owner-1', email: 'owner@example.test', role: 'owner', status: 'active', createdAt: '2026-11-20T00:00:00.000Z' },
    { userId: 'member-2', email: 'member@example.test', role: 'member', status: 'active', createdAt: '2026-11-20T00:00:00.000Z' }
  ];
  const invitations = [
    { id: 'invite-1', email: 'pending@example.test', role: 'member', createdAt: '2026-11-20T00:00:00.000Z', expiresAt: '2026-11-27T00:00:00.000Z', acceptedAt: null, cancelledAt: null }
  ];
  await setSessionFixture(page, {
    accessToken: 'company-owner-token',
    tenantId: 'company-pro',
    user: { id: 'owner-1', email: 'owner@example.test', roles: ['admin'], tenantId: 'company-pro' }
  });
  await page.route('**/api/companies', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ companies: [{ id: 'company-pro', name: 'Company Pro', role: 'owner', active: true }] })
  }));
  await page.route('**/api/companies/company-pro/memberships**', route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ memberships: members }) });
    const userId = route.request().url().split('/').pop() || '';
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      const member = members.find(item => item.userId === userId);
      if (member) member.role = body.role;
    }
    if (route.request().method() === 'PATCH') {
      const segments = new URL(route.request().url()).pathname.split('/');
      const memberId = segments[segments.length - 2];
      const member = members.find(item => item.userId === memberId);
      if (member) member.status = route.request().postDataJSON().status;
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route('**/api/companies/company-pro/invitations**', route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ invitations }) });
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      invitations.push({ id: 'invite-2', email: body.email, role: body.role, createdAt: '2026-11-20T00:00:00.000Z', expiresAt: '2026-11-27T00:00:00.000Z', acceptedAt: null, cancelledAt: null });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ invitation: invitations[1], acceptanceToken: 'one-time-invite-token' }) });
    }
    const invitationId = route.request().url().split('/').pop();
    const invitation = invitations.find(item => item.id === invitationId);
    if (invitation) invitation.cancelledAt = '2026-11-20T00:00:00.000Z';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.goto('/dashboard');
  await page.getByRole('complementary').getByRole('button', { name: 'Organization' }).click();
  await page.getByRole('complementary').locator('.settings-nav__children').getByRole('button', { name: 'Users', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Table view' }).click();
  const memberRow = page.locator('.bee-users__table tr').filter({ hasText: 'member@example.test' });
  await memberRow.locator('select').selectOption('manager');
  await expect(memberRow.locator('select')).toHaveValue('manager');
  await expect.poll(() => members.find(item => item.userId === 'member-2')?.role).toBe('manager');
  await memberRow.getByRole('button', { name: /member options/i }).click();
  await page.getByRole('button', { name: 'Suspend access' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.poll(() => members.find(item => item.userId === 'member-2')?.status).toBe('suspended');
  await expect(memberRow).toContainText(/suspended/i);

  await page.getByPlaceholder('name@company.com').fill('new@example.test');
  await page.locator('select[name="inviteRole"]').selectOption('member');
  await page.getByRole('button', { name: 'Create invitation' }).click();
  await expect(page.getByLabel('Invitation link')).toHaveValue(/one-time-invite-token/);
  const newInvitation = page.locator('.bee-users__invitation').filter({ hasText: 'new@example.test' });
  await expect(newInvitation).toBeVisible();
  await newInvitation.getByRole('button', { name: /invitation options/i }).click();
  await newInvitation.getByRole('button', { name: 'Revoke invitation' }).click();
  await newInvitation.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(newInvitation).toContainText('Revoked');
});


test('a signed-in member can accept an invitation through the secure invitation route', async ({ page }) => {
  await page.route('**/api/auth/invitations/preview', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ invitation: { email: 'user@example.test', companyName: 'Company B', role: 'member', restrictions: [], expiresAt: '2026-11-30T00:00:00.000Z' } })
  }));
  await page.route('**/api/auth/login', route => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'set-cookie': 'refreshToken=test-refresh; Path=/; SameSite=Lax' },
    body: JSON.stringify({ accessToken: 'company-b-token', tenantId: 'company-b', user: { id: 'user-a', email: 'user@example.test', roles: ['user'], tenantId: 'company-b' } })
  }));
  await page.route('**/api/invitations/accept', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, company: { id: 'company-b', name: 'Company B' }, membership: { role: 'member' } })
  }));
  await page.route('**/api/auth/refresh', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ accessToken: 'company-b-token', tenantId: 'company-b', user: { id: 'user-a', email: 'user@example.test', roles: ['user'], tenantId: 'company-b' } })
  }));
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ authenticated: true, tenantId: 'company-b' })
  }));
  await page.route('**/api/companies', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ companies: [{ id: 'company-b', name: 'Company B', role: 'member', active: true }] })
  }));
  await page.goto('/invite/accept?token=one-time-invitation-token');
  await expect(page.getByRole('heading', { name: 'Join your organization' })).toBeVisible();
  await expect(page.getByText('You have been invited to join Company B.')).toBeVisible();
  await page.getByLabel('I already have a Bee-Core account').check();
  await page.locator('input[name="invitationPassword"]').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Sign in and accept invitation' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard');
  await expect(page.getByLabel('Active company')).toHaveValue('company-b');
});

test('company member data cannot leak across a rapid active-company switch', async ({ page }) => {
  let activeCompany = 'company-a';
  await setSessionFixture(page, {
    accessToken: 'company-a-token',
    tenantId: 'company-a',
    user: { id: 'owner-1', email: 'owner@example.test', roles: ['admin'], tenantId: 'company-a' }
  });
  await page.route('**/api/companies', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ companies: [
      { id: 'company-a', name: 'Company A', role: 'owner', active: activeCompany === 'company-a' },
      { id: 'company-b', name: 'Company B', role: 'owner', active: activeCompany === 'company-b' }
    ] })
  }));
  await page.route('**/api/companies/company-b/activate', route => {
    activeCompany = 'company-b';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'company-b-token', tenantId: 'company-b', membership: { role: 'owner' } })
    });
  });
  await page.route('**/api/companies/company-b/memberships', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ memberships: [
      { userId: 'member-b', email: 'member-b@example.test', role: 'member', status: 'active', createdAt: '2026-11-20T00:00:00.000Z' }
    ] })
  }));
  await page.route('**/api/companies/company-b/invitations', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ invitations: [] })
  }));
  await page.route('**/api/companies/company-b/roles', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ roles: [{ id: 'role-b', name: 'Company B custom role', description: '', permissions: ['members.read'] }] })
  }));
  await page.route('**/api/companies/company-a/audit-events', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ events: [], page: 1, hasMore: false })
  }));
  await page.route('**/api/companies/company-b/audit-events', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ events: [], page: 1, hasMore: false })
  }));

  let signalCompanyAStarted!: () => void;
  const companyAStarted = new Promise<void>(resolve => { signalCompanyAStarted = resolve; });
  await page.route('**/api/companies/company-a/memberships', async route => {
    signalCompanyAStarted();
    await new Promise(resolve => setTimeout(resolve, 700));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ memberships: [
      { userId: 'member-a', email: 'member-a@example.test', role: 'member', status: 'active', createdAt: '2026-11-20T00:00:00.000Z' }
    ] }) });
  });
  await page.goto('/dashboard');
  await page.getByRole('complementary').getByRole('button', { name: 'Organization' }).click();
  await page.getByRole('complementary').locator('.settings-nav__children').getByRole('button', { name: 'Users', exact: true }).click();
  await page.getByRole('button', { name: 'Card view' }).click();
  await companyAStarted;
  const selector = page.getByLabel('Active company');
  await selector.selectOption('company-b');
  await expect(page.getByText('member-b@example.test')).toBeVisible();
  const companyBMemberRow = page.locator('.bee-users__card').filter({ hasText: 'member-b@example.test' });
  await expect(companyBMemberRow.locator('select option[value="custom:role-b"]')).toHaveText('Company B custom role');
  await page.waitForTimeout(850);
  await expect(page.getByText('member-a@example.test')).toHaveCount(0);
  await expect(companyBMemberRow.locator('option[value="custom:role-b"]')).toHaveText('Company B custom role');
  await expect(page.getByLabel('Active company')).toHaveValue('company-b');
});


test('Settings > Tenants supports card/list views, tenant management and create modal', async ({ page }) => {
  let companies = [
    { id: 'company-1', name: 'Acme Studio', slug: 'acme', status: 'active', createdAt: '2026-11-20T00:00:00.000Z', membersCount: 4 }
  ];
  await setSessionFixture(page, {
    accessToken: 'platform-admin-token',
    platformRole: 'superadmin',
    tenantId: 'company-1',
    user: { id: 'root-1', email: 'root@example.test', roles: ['admin'], tenantId: 'company-1' }
  });
  await page.route('**/api/platform/companies', route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      companies.push({ id: 'company-2', name: body.name, slug: body.slug || null, status: 'active', createdAt: new Date().toISOString(), membersCount: 1 });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ company: companies[1] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ companies }) });
  });
  await page.route('**/api/platform/companies/*/plugins', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ plugins: [{ id: 'hello-world', name: 'Hola Mundo', installed: true, status: 'installed' }] })
  }));
  await page.route('**/api/platform/companies/*/plugins/hello-world', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, status: 'installed' })
  }));
  await page.route('**/api/platform/companies/company-1', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ success: true })
  }));

  await page.goto('/dashboard/settings/tenants');
  await expect(page.getByRole('heading', { name: 'Tenants', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Acme Studio' })).toBeVisible();
  await page.getByTitle('Table view').click();
  await expect(page.locator('.platform-admin__table')).toBeVisible();
  await expect(page.locator('.platform-admin__table')).toContainText('Acme Studio');
  await page.getByTitle('Card view').click();
  await page.getByRole('button', { name: 'Company actions' }).click();
  await expect(page.getByRole('button', { name: 'Disable' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Message' })).toBeDisabled();
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard/settings/tenants/company-1/manage');
  await expect(page.getByRole('heading', { name: 'Acme Studio' })).toBeVisible();
  await page.getByRole('button', { name: 'Tenants', exact: true }).click();
  await page.getByRole('button', { name: /new tenant/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Create a tenant' })).toBeVisible();
  await dialog.locator('input[name="companyName"]').fill('New Tenant');
  await dialog.locator('input[name="companySlug"]').fill('new-tenant');
  await dialog.getByPlaceholder('owner@company.com').fill('owner@new-tenant.test');
  await dialog.getByRole('button', { name: 'Create tenant' }).click();
  await expect(page.getByRole('heading', { name: 'New Tenant' })).toBeVisible();
});


test('Settings plugins supports cards/list and role-scoped plugin actions', async ({ page }) => {
  await setSessionFixture(page, {
    accessToken: 'tenant-admin-token',
    tenantId: 'tenant-ref',
    user: { email: 'root@example.test', roles: ['admin'], tenantId: 'tenant-ref' }
  });
  await page.route('**/api/companies', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ companies: [{ id: 'tenant-ref', name: 'Bee Tenant', role: 'owner', active: true }] })
  }));
  await page.route('**/api/marketplace/plugins', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ plugins: [{ id: 'masked-plugin-ref', name: 'Sample Workspace', version: '1.2.0', description: 'Shared workspace sample', category: 'productivity', system: false, entitled: true, installed: true, installedVersion: '1.2.0' }] })
  }));
  await page.route('**/api/marketplace/plugins/masked-plugin-ref', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ plugin: { id: 'masked-plugin-ref', name: 'Sample Workspace', version: '1.2.0', description: 'Shared workspace sample', category: 'productivity', system: false, entitled: true, installed: true, installedVersion: '1.2.0', accessSource: 'plan' } })
  }));
  await page.goto('/dashboard');
  await page.getByRole('complementary').getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('button', { name: 'Plugins', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Plugins', exact: true }).click();
  const catalogue = page.locator('bee-plugin-settings');
  await expect(catalogue.getByRole('heading', { name: 'Plugins' })).toBeVisible();
  await expect(catalogue.getByRole('button', { name: /upload/i })).toHaveCount(0);
  await catalogue.getByRole('button', { name: 'Table view' }).click();
  await expect(catalogue.locator('.plugin-settings__table-wrap')).toBeVisible();
  await catalogue.getByRole('button', { name: 'Card view' }).click();
  const plugin = catalogue.locator('.plugin-settings__card').filter({ hasText: 'Sample Workspace' });
  await plugin.getByRole('button', { name: 'Actions for Sample Workspace' }).click();
  await expect(plugin.getByRole('menuitem', { name: 'Uninstall' })).toBeEnabled();
  await expect(plugin.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);
  await plugin.getByRole('menuitem', { name: 'Details' }).click();
  await expect(page).toHaveURL(/\/dashboard\/plugins\/masked-plugin-ref\/details$/);
  await expect(catalogue.getByRole('heading', { name: 'Sample Workspace', level: 2 })).toBeVisible();
  await catalogue.getByRole('button', { name: 'Back to modules' }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings\/plugins$/);
});


test('Settings exposes the seven role-authorized sections and General has four cards', async ({ page }) => {
  await setSessionFixture(page, {
    accessToken: 'platform-admin-token',
    platformRole: 'superadmin',
    tenantId: 'tenant-demo',
    user: { id: 'root-1', email: 'root@example.test', roles: ['admin'], tenantId: 'tenant-demo' }
  });
  await page.route('**/api/companies', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ companies: [{ id: 'tenant-demo', name: 'Bee Demo', role: 'owner', active: true }] })
  }));
  await page.route('**/api/templates/preferences', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ selection: { public: 'aurora', dashboard: 'midnight' }, installedTemplates: ['aurora', 'midnight'] })
  }));
  await page.goto('/dashboard/settings');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard/settings');
  await expect(page.getByRole('heading', { name: 'General', exact: true })).toBeVisible();
  await expect(page.locator('.settings-workspace__general > article')).toHaveCount(4);
  for (const title of ['Platform Identity', 'Appearance', 'Platform Preferences', 'Platform Defaults']) {
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  const expected = [
    ['Tenants', '/dashboard/settings/tenants'],
    ['Plugins', '/dashboard/settings/plugins'],
    ['Plans & Licensing', '/dashboard/settings/plans-licensing'],
    ['Security', '/dashboard/settings/security'],
    ['Infrastructure', '/dashboard/settings/infrastructure'],
    ['Language & Localization', '/dashboard/settings/localization']
  ];
  for (const [label, route] of expected) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(route);
  }
  await expect(page.getByRole('button', { name: 'Plugins', exact: true })).toHaveCount(1);
});
