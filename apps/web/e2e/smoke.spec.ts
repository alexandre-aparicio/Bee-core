import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Mirror the test's localStorage session fixture into a test-only cookie.
  // Production authentication continues to use the HTTP-only refresh cookie.
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string): void {
      originalSetItem.call(this, key, value);
      if (this === window.localStorage && key === 'bee-auth') {
        document.cookie = `bee-test-auth=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
      }
    };
  });

  const readSessionFixture = (request: { headers(): Record<string, string> }) => {
    const cookie = request.headers().cookie || '';
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

  await page.route('**/api/auth/refresh', route => {
    const session = readSessionFixture(route.request());
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

  await page.route('**/api/auth/me', route => {
    const token = route.request().headers().authorization || '';
    const session = readSessionFixture(route.request());
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
});

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

test('dashboard redirects unauthenticated visitors to the visible login page', async ({ page }) => {
  await page.goto('/dashboard');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login');
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
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
  await page.addInitScript(() => localStorage.setItem('bee-auth', JSON.stringify({
    accessToken: 'test-admin-token',
    user: { email: 'admin@example.test', roles: ['admin'], tenantId: 'tenant-demo' }
  })));
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
  await page.goto('/dashboard');
  const manager = page.getByRole('region', { name: 'Template manager' });
  await expect(manager).toBeVisible();
  await manager.locator('.bee-template-package').filter({ hasText: 'Glass' }).getByRole('button', { name: 'Install' }).click();
  await expect(manager.getByText('Package installed for this tenant.')).toBeVisible();
  await manager.getByLabel('Dashboard').selectOption('glass');
  await expect(page.locator('[data-bee-layout="dashboard.glass"]')).toBeVisible();
  await expect.poll(() => page.locator('.bee-template-package-host--glass').evaluate(node => getComputedStyle(node).getPropertyValue('--bg').trim())).toBe('#eaf1fc');
  await manager.getByRole('button', { name: 'Discard preview' }).click();
  await expect(page.locator('[data-bee-layout="dashboard.midnight"]')).toBeVisible();
  await expect.poll(() => page.locator('.bee-template-package-host--midnight').evaluate(node => getComputedStyle(node).getPropertyValue('--bg').trim())).toBe('#080a12');
  await manager.getByLabel('Dashboard').selectOption('glass');
  await manager.getByRole('button', { name: 'Apply template changes' }).click();
  await expect.poll(() => page.locator('.bee-template-package-host--glass').evaluate(node => getComputedStyle(node).getPropertyValue('--bg').trim())).toBe('#eaf1fc');
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
  const notes: Array<{id:string;title:string;content:string;createdBy:string;createdAt:string;updatedAt:string}> = [];
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
  await page.route('**/api/notes', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes }) });
    }
    const body = route.request().postDataJSON();
    const now = new Date().toISOString();
    const note = { id: 'note-' + (notes.length + 1), title: body.title, content: body.content, createdBy: 'owner-1', createdAt: now, updatedAt: now };
    notes.push(note);
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ note }) });
  });
  await page.route('**/api/notes/**', route => {
    const noteId = route.request().url().split('/').pop() || '';
    if (route.request().method() === 'DELETE') {
      const index = notes.findIndex(note => note.id === noteId);
      if (index >= 0) notes.splice(index, 1);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
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
  const notesRow = page.locator('.bee-marketplace__item').filter({ hasText: 'Team Notes' });
  await notesRow.getByRole('button', { name: 'Install' }).click();
  await expect(page.getByText('Team Notes installed for this company.')).toBeVisible();
  await expect(page.locator('.bee-marketplace__item').filter({ hasText: 'Team Notes' }).getByText('Installed', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Team Notes' })).toBeVisible();
  await page.getByPlaceholder('Note title').fill('Quarterly planning');
  await page.getByPlaceholder('Write something for your team…').fill('Private notes stay in this company.');
  await page.getByRole('button', { name: 'Create note' }).click();
  await expect(page.getByRole('heading', { name: 'Quarterly planning' })).toBeVisible();
  const notesPanel = page.locator('.bee-notes');
  await expect(notesPanel).toBeVisible();
  await notesPanel.getByPlaceholder('Note title').fill('First company note');
  await notesPanel.getByPlaceholder('Write something for your team…').fill('This note belongs to Company Pro');
  await notesPanel.getByRole('button', { name: 'Create note' }).click();
  await expect(notesPanel.getByText('First company note')).toBeVisible();
  await expect(notesPanel.getByText('Note saved for this company.')).toBeVisible();
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


test('company owner can invite, change roles and suspend company members', async ({ page }) => {
  const members = [
    { userId: 'owner-1', email: 'owner@example.test', role: 'owner', status: 'active', createdAt: '2026-11-20T00:00:00.000Z' },
    { userId: 'member-2', email: 'member@example.test', role: 'member', status: 'active', createdAt: '2026-11-20T00:00:00.000Z' }
  ];
  const invitations = [
    { id: 'invite-1', email: 'pending@example.test', role: 'member', createdAt: '2026-11-20T00:00:00.000Z', expiresAt: '2026-11-27T00:00:00.000Z', acceptedAt: null, cancelledAt: null }
  ];
  await page.addInitScript(() => {
    if (!localStorage.getItem('bee-auth')) localStorage.setItem('bee-auth', JSON.stringify({
      accessToken: 'company-owner-token',
      tenantId: 'company-pro',
      user: { id: 'owner-1', email: 'owner@example.test', roles: ['admin'], tenantId: 'company-pro' }
    }));
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
    if (route.request().method() === 'DELETE') {
      const member = members.find(item => item.userId === userId);
      if (member) member.status = 'suspended';
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
  await expect(page.getByRole('heading', { name: 'Company members' })).toBeVisible();
  const memberRow = page.locator('.bee-company-members__table tr').filter({ hasText: 'member@example.test' });
  await memberRow.locator('select').selectOption('manager');
  await expect(memberRow.locator('select')).toHaveValue('manager');
  await expect.poll(() => members.find(item => item.userId === 'member-2')?.role).toBe('manager');
  await memberRow.getByRole('button', { name: 'Suspend' }).click();
  await expect.poll(() => members.find(item => item.userId === 'member-2')?.status).toBe('suspended');
  await expect(memberRow).toContainText('suspended');

  await page.getByPlaceholder('colleague@company.com').fill('new@example.test');
  await page.locator('select[name="inviteRole"]').selectOption('member');
  await page.getByRole('button', { name: 'Create invitation' }).click();
  await expect(page.getByText('one-time-invite-token')).toBeVisible();
  const newInvitation = page.locator('.bee-company-members__invitation').filter({ hasText: 'new@example.test' });
  await expect(newInvitation).toBeVisible();
  await newInvitation.getByRole('button', { name: 'Cancel' }).click();
  await expect(newInvitation).toContainText('cancelled');
});


test('a signed-in member can accept an invitation and see the new company in the switcher', async ({ page }) => {
  let accepted = false;
  await page.addInitScript(() => {
    if (!localStorage.getItem('bee-auth')) localStorage.setItem('bee-auth', JSON.stringify({
      accessToken: 'company-a-token',
      tenantId: 'company-a',
      user: { id: 'user-a', email: 'user@example.test', roles: ['user'], tenantId: 'company-a' }
    }));
  });
  await page.route('**/api/companies', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ companies: [
      { id: 'company-a', name: 'Company A', role: 'member', active: true },
      ...(accepted ? [{ id: 'company-b', name: 'Company B', role: 'member', active: false }] : [])
    ] })
  }));
  await page.route('**/api/companies/company-a/memberships', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ memberships: [] })
  }));
  await page.route('**/api/invitations/accept', route => {
    accepted = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, company: { id: 'company-b', name: 'Company B' }, membership: { role: 'member' } })
    });
  });
  await page.goto('/dashboard');
  await page.getByPlaceholder('Paste a company invitation token').fill('one-time-invitation-token');
  await page.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(page.getByText('Invitation accepted for Company B. Select that company in the workspace switcher.')).toBeVisible();
  await expect(page.getByLabel('Active company')).toHaveValue('company-a');
  await expect(page.getByLabel('Active company').locator('option[value="company-b"]')).toHaveCount(1);
});

test('company member data cannot leak across a rapid active-company switch', async ({ page }) => {
  let activeCompany = 'company-a';
  await page.addInitScript(() => localStorage.setItem('bee-auth', JSON.stringify({
    accessToken: 'company-a-token',
    tenantId: 'company-a',
    user: { id: 'owner-1', email: 'owner@example.test', roles: ['admin'], tenantId: 'company-a' }
  })));
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
  await companyAStarted;
  const selector = page.getByLabel('Active company');
  await selector.selectOption('company-b');
  await expect(page.getByText('member-b@example.test')).toBeVisible();
  const companyBMemberRow = page.locator('.bee-company-members__table tr').filter({ hasText: 'member-b@example.test' });
  await expect(companyBMemberRow.locator('option[value="custom:role-b"]')).toHaveText('Company B custom role');
  await page.waitForTimeout(850);
  await expect(page.getByText('member-a@example.test')).toHaveCount(0);
  await expect(companyBMemberRow.locator('option[value="custom:role-b"]')).toHaveText('Company B custom role');
  await expect(page.getByLabel('Active company')).toHaveValue('company-b');
});


test('Settings > Tenants supports card/list views, tenant management and create modal', async ({ page }) => {
  let companies = [
    { id: 'company-1', name: 'Acme Studio', slug: 'acme', status: 'active', createdAt: '2026-11-20T00:00:00.000Z', membersCount: 4 }
  ];
  await page.addInitScript(() => localStorage.setItem('bee-auth', JSON.stringify({
    accessToken: 'platform-admin-token',
    platformRole: 'superadmin',
    tenantId: 'company-1',
    user: { id: 'root-1', email: 'root@example.test', roles: ['admin'], tenantId: 'company-1' }
  })));
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
  await page.getByTitle('List view').click();
  await expect(page.locator('.platform-admin__table')).toBeVisible();
  await expect(page.locator('.platform-admin__table')).toContainText('Acme Studio');
  await page.getByTitle('Card view').click();
  await page.getByRole('button', { name: 'Company actions' }).click();
  await expect(page.getByRole('button', { name: 'Disable' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Message' })).toBeDisabled();
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard/settings/tenants/company-1/manage');
  await expect(page.getByRole('heading', { name: 'Acme Studio' })).toBeVisible();
  await page.getByRole('button', { name: /tenants/i }).click();
  await page.getByRole('button', { name: /new tenant/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Create a tenant' })).toBeVisible();
  await dialog.getByPlaceholder('Dragchart').fill('New Tenant');
  await dialog.locator('input[name="companySlug"]').fill('new-tenant');
  await dialog.getByPlaceholder('owner@company.com').fill('owner@new-tenant.test');
  await dialog.getByRole('button', { name: 'Create tenant' }).click();
  await expect(page.getByRole('heading', { name: 'New Tenant' })).toBeVisible();
});


test('Settings plugins supports cards/list and only enables plugin details', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bee-auth', JSON.stringify({
    accessToken: 'platform-admin-token',
    user: { email: 'root@example.test', roles: ['admin'], tenantId: 'tenant-ref' }
  })));
  await page.route('**/api/companies', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ companies: [{ id: 'tenant-ref', name: 'Bee Tenant', role: 'owner', active: true }] })
  }));
  await page.route('**/api/marketplace/plugins', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ plugins: [{ id: 'masked-plugin-ref', name: 'Team Notes', version: '1.2.0', description: 'Shared team notes', category: 'productivity', system: false, entitled: true, installed: true, installedVersion: '1.2.0' }] })
  }));
  await page.route('**/api/marketplace/plugins/masked-plugin-ref', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ plugin: { id: 'masked-plugin-ref', name: 'Team Notes', version: '1.2.0', description: 'Shared team notes', category: 'productivity', system: false, entitled: true, installed: true, installedVersion: '1.2.0', accessSource: 'plan' } })
  }));
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /settings/i }).click();
  await expect(page.getByRole('button', { name: 'Plugins', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Plugins', exact: true }).click();
  const catalogue = page.locator('bee-plugin-settings');
  await expect(catalogue.getByRole('heading', { name: 'Plugins' })).toBeVisible();
  await expect(catalogue.getByRole('button', { name: /upload/i })).toBeDisabled();
  await catalogue.getByRole('button', { name: /list/i }).click();
  await expect(catalogue.locator('.plugin-settings__grid')).toHaveClass(/is-list/);
  await catalogue.getByRole('button', { name: /cards/i }).click();
  const plugin = catalogue.locator('.plugin-settings__card').filter({ hasText: 'Team Notes' });
  await plugin.getByRole('button', { name: 'Actions for Team Notes' }).click();
  await expect(plugin.getByRole('menuitem', { name: 'Uninstall' })).toBeDisabled();
  await expect(plugin.getByRole('menuitem', { name: 'Delete' })).toBeDisabled();
  await plugin.getByRole('menuitem', { name: 'Details' }).click();
  await expect(page).toHaveURL(/\/dashboard\/plugins\/masked-plugin-ref\/details$/);
  await expect(catalogue.getByRole('heading', { name: 'Team Notes' })).toBeVisible();
  await catalogue.getByRole('button', { name: /back to plugins/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings\/plugins$/);
});


test('Settings exposes the seven role-authorized sections and General has exactly three cards', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bee-auth', JSON.stringify({
    accessToken: 'platform-admin-token',
    platformRole: 'superadmin',
    tenantId: 'tenant-demo',
    user: { id: 'root-1', email: 'root@example.test', roles: ['admin'], tenantId: 'tenant-demo' }
  })));
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
  await expect(page.locator('.settings-workspace__general > article')).toHaveCount(3);
  for (const title of ['Platform Identity', 'Appearance', 'Platform Defaults']) {
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  const expected = [
    ['Tenants', '/dashboard/settings/tenants'],
    ['Plugins', '/dashboard/settings/plugins'],
    ['Plans & Licensing', '/dashboard/settings/plans-licensing'],
    ['Security', '/dashboard/settings/security'],
    ['Infrastructure', '/dashboard/settings/infrastructure'],
    ['Localization', '/dashboard/settings/localization']
  ];
  for (const [label, route] of expected) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(route);
  }
  await expect(page.getByRole('button', { name: 'Plugins', exact: true })).toHaveCount(1);
});
