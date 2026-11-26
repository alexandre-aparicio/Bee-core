import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

type BrowserDiagnostic = {
  kind: 'console.error' | 'pageerror' | 'api.5xx';
  detail: string;
};

async function installQualityGate(page: Page, diagnostics: BrowserDiagnostic[]): Promise<void> {
  page.on('console', message => {
    if (message.type() === 'error') {
      diagnostics.push({ kind: 'console.error', detail: message.text() });
    }
  });
  page.on('pageerror', error => {
    diagnostics.push({ kind: 'pageerror', detail: error.stack || error.message });
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
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const diagnostics: BrowserDiagnostic[] = [];
    await installQualityGate(page, diagnostics);
    await use(page);
    expect(diagnostics, 'Unexpected browser console errors, uncaught exceptions or API 5xx responses').toEqual([]);
  }
});

export { expect };
