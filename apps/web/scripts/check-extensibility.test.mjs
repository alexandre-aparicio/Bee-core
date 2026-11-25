import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const appRoot = process.cwd();
const sourcePackages = resolve(appRoot, 'src/app/templates/packages');
const checkerPath = resolve(appRoot, 'scripts/check-template-tokens.mjs');
const sourceBase = resolve(appRoot, 'src/app/templates/base');
const sourceCore = resolve(appRoot, 'src/app/templates/core');

async function snapshot(directory) {
  const result = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else result.push([relative(directory, path), await readFile(path, 'utf8')]);
    }
  }
  await walk(directory);
  return result.sort(([a], [b]) => a.localeCompare(b));
}

function runChecker(packagesDir) {
  return spawnSync(process.execPath, [checkerPath, '--packages-dir', packagesDir], {
    cwd: appRoot,
    encoding: 'utf8'
  });
}

test('a template package extends the contract with only manifest, tokens and one registration line', async t => {
  const baseBefore = await snapshot(sourceBase);
  const coreBefore = await snapshot(sourceCore);
  const temporary = await mkdtemp(join(tmpdir(), 'bee-template-extensibility-'));
  try {
    const packagesDir = join(temporary, 'packages');
    const packageDir = join(packagesDir, 'fixture');
    await mkdir(packageDir, { recursive: true });
    const manifestSource = await readFile(join(sourcePackages, 'aurora', 'manifest.ts'), 'utf8');
    const tokensSource = await readFile(join(sourcePackages, 'aurora', 'tokens.css'), 'utf8');
    const manifest = manifestSource.replace("id: 'aurora'", "id: 'fixture'").replaceAll('public.aurora', 'public.fixture');
    const tokens = tokensSource.replaceAll('aurora', 'fixture');
    await writeFile(join(packageDir, 'manifest.ts'), manifest);
    await writeFile(join(packageDir, 'tokens.css'), tokens);
    const registration = 'export { AURORA_MANIFEST as FIXTURE_MANIFEST } from "./fixture/manifest";\n';
    await writeFile(join(packagesDir, 'index.ts'), registration);

    assert.deepEqual((await readdir(packagesDir)).sort(), ['fixture', 'index.ts']);
    assert.deepEqual((await readdir(packageDir)).sort(), ['manifest.ts', 'tokens.css']);
    assert.equal((await readFile(join(packagesDir, 'index.ts'), 'utf8')).trim().split('\n').length, 1);

    const valid = runChecker(packagesDir);
    assert.equal(valid.status, 0, valid.stdout + '\n' + valid.stderr);

    await t.test('rejects a package with a missing semantic token', async () => {
      const missingToken = tokens.replace(/^\s*--bee-bg:\s*[^;]+;\s*$/m, '');
      assert.notEqual(missingToken, tokens, 'fixture must contain a --bee-bg declaration');
      await writeFile(join(packageDir, 'tokens.css'), missingToken);
      const result = runChecker(packagesDir);
      assert.notEqual(result.status, 0, result.stdout + '\n' + result.stderr);
      assert.match(result.stdout + result.stderr, /fixture: light is missing --bee-bg/);
      await writeFile(join(packageDir, 'tokens.css'), tokens);
    });

    await t.test('rejects a package with a missing declared mode block', async () => {
      const marker = 'data-bee-public-mode="dark"';
      const markerIndex = tokens.indexOf(marker);
      assert.notEqual(markerIndex, -1, 'fixture must contain its dark mode selector');
      const blockStart = tokens.lastIndexOf('}', markerIndex) + 1;
      const blockOpen = tokens.indexOf('{', markerIndex);
      const blockEnd = tokens.indexOf('}', blockOpen);
      assert.ok(blockOpen > markerIndex && blockEnd > blockOpen, 'dark mode rule must be well formed');
      const missingDark = tokens.slice(0, blockStart) + tokens.slice(blockEnd + 1);
      await writeFile(join(packageDir, 'tokens.css'), missingDark);
      const result = runChecker(packagesDir);
      assert.notEqual(result.status, 0, result.stdout + '\n' + result.stderr);
      assert.match(result.stdout + result.stderr, /fixture: missing dark token block/);
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
    assert.deepEqual(await snapshot(sourceBase), baseBefore, 'templates/base must remain unchanged');
    assert.deepEqual(await snapshot(sourceCore), coreBefore, 'templates/core must remain unchanged');
  }
});
