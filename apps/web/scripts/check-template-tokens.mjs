#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const packageRoot = 'src/app/templates/packages';
const contractPath = 'src/app/templates/base/tokens.contract.css';
const contract = await readFile(contractPath, 'utf8');
const requiredTokens = [...contract.matchAll(/^\s*(--bee-[\w-]+)\s*:/gm)].map(match => match[1]);
const packageDirs = await readdir(packageRoot, { withFileTypes: true });
const errors = [];
const results = [];

for (const entry of packageDirs.filter(item => item.isDirectory() && item.name !== 'shared')) {
  const id = entry.name;
  const manifestPath = join(packageRoot, id, 'manifest.ts');

  let manifest;
  try {
    manifest = await readFile(manifestPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    errors.push(`${id}: unable to read manifest.ts (${error.message})`);
    continue;
  }

  const tokensPath = join(packageRoot, id, 'tokens.css');
  let tokens;
  try {
    tokens = await readFile(tokensPath, 'utf8');
  } catch (error) {
    errors.push(`${id}: missing or unreadable tokens.css (${error.message})`);
    continue;
  }

  const target = manifest.match(/target:\s*'(public|dashboard)'/)?.[1];
  const defaultMode = manifest.match(/defaultMode:\s*'(light|dark)'/)?.[1];
  const modeList = manifest.match(/appearanceModes:\s*\[([^\]]+)\]/)?.[1] || '';
  const declaredModes = [...modeList.matchAll(/'(light|dark)'/g)].map(match => match[1]);
  if (!target) errors.push(`${id}: manifest target is missing or invalid`);
  if (!defaultMode || !declaredModes.includes(defaultMode)) errors.push(`${id}: defaultMode must be included in appearanceModes`);

  const modeAttribute = target === 'public' ? 'public' : 'dashboard';
  const blocks = new Map();
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of tokens.matchAll(blockPattern)) {
    const selectors = match[1];
    if (!selectors.includes(`.bee-template-package-host[data-bee-template="${id}"][data-bee-${modeAttribute}-mode="`)) continue;
    const mode = selectors.match(/data-bee-(?:public|dashboard)-mode="(light|dark)"/)?.[1];
    if (!mode) continue;
    const htmlSelector = `html[data-bee-active-template="${id}"][data-bee-active-mode="${mode}"]`;
    if (!selectors.includes(htmlSelector)) errors.push(`${id}: ${mode} block is missing html active-template scope`);
    const selectorTarget = selectors.match(/data-bee-(public|dashboard)-mode=/)?.[1];
    if (selectorTarget !== modeAttribute) errors.push(`${id}: ${mode} block uses data-bee-${selectorTarget}-mode but target is ${target}`);
    const declared = new Set([...match[2].matchAll(/^\s*(--bee-[\w-]+)\s*:/gm)].map(item => item[1]));
    blocks.set(mode, declared);
  }

  for (const mode of declaredModes) {
    const declared = blocks.get(mode);
    if (!declared) {
      errors.push(`${id}: missing ${mode} token block`);
      continue;
    }
    const missing = requiredTokens.filter(token => !declared.has(token));
    if (missing.length) errors.push(`${id}: ${mode} is missing ${missing.join(', ')}`);
  }
  results.push({ id, target, defaultMode, appearanceModes: declaredModes, tokenBlocks: [...blocks.keys()] });
}

console.log(JSON.stringify({ requiredTokenCount: requiredTokens.length, packages: results, errors }, null, 2));
if (errors.length) process.exitCode = 1;
