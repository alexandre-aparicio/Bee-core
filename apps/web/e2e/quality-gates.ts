import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

type BrowserDiagnostic = {
  kind: 'console.error' | 'pageerror' | 'api.5xx' | 'api.requestfailed';
  detail: string;
};

async function installQualityGate(page: Page, diagnostics: BrowserDiagnostic[]): Promise<void> {
  page.on('console', message => {
    if (message.type() !== 'error') return;
    // Chromium emits these for failed HTTP resources; API server failures are
    // checked separately below so expected 401/404 responses are not misreported.
    if (message.text().startsWith('Failed to load resource:')) return;
    diagnostics.push({ kind: 'console.error', detail: message.text() });
  });
  page.on('pageerror', error => {
    const detail = error.stack || error.message;
    // Playwright init scripts also execute inside the intentionally sandboxed
    // ZIP iframe. Accessing its opaque-origin localStorage is expected to throw.
    if (detail.includes("SecurityError: Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.")) return;
    diagnostics.push({ kind: 'pageerror', detail });
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/') && response.status() >= 500) {
      diagnostics.push({
        kind: 'api.5xx',
        detail: response.status() + ' ' + response.request().method() + ' ' + url.pathname
      });
    }
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return;
    diagnostics.push({
      kind: 'api.requestfailed',
      detail: request.method() + ' ' + url.pathname + ': ' + (request.failure()?.errorText ?? 'unknown network failure')
    });
  });
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const diagnostics: BrowserDiagnostic[] = [];
    await installQualityGate(page, diagnostics);
    await use(page);
    expect(diagnostics, 'Unexpected browser console errors, uncaught exceptions, API 5xx responses or failed API requests').toEqual([]);
  }
});

export { expect };
