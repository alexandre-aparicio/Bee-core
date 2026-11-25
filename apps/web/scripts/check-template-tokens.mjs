#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
const contrastReport = args.includes('--contrast-report');
const contrastBlocking = args.includes('--contrast-blocking');
const packageRoot = 'src/app/templates/packages';
const contractPath = 'src/app/templates/base/tokens.contract.css';
const contract = await readFile(contractPath, 'utf8');
const contractDeclarations = [...contract.matchAll(/^\s*(--bee-[\w-]+)\s*:/gm)].map(match => match[1]);
const requiredTokens = [...new Set(contractDeclarations)].sort();
const packageDirs = await readdir(packageRoot, { withFileTypes: true });
const errors = [];
const warnings = [];
const results = [];
const contrastPackages = [];

const contractCounts = new Map();
for (const token of contractDeclarations) contractCounts.set(token, (contractCounts.get(token) || 0) + 1);
for (const [token, count] of contractCounts) {
  if (count > 1) errors.push('tokens.contract.css: ' + token + ' is declared ' + count + ' times');
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(path));
    } else if (entry.isFile() && /\.(?:css|ts|html)$/i.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const sourceFiles = await collectSourceFiles('src');
const usedTokens = new Map();
for (const file of sourceFiles) {
  if (file === contractPath || /\/tokens\.css$/.test(file)) continue;
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/var\(\s*(--bee-[\w-]+)/g)) {
    const token = match[1];
    if (!usedTokens.has(token)) usedTokens.set(token, new Set());
    usedTokens.get(token).add(file);
  }
}
const undefinedTokens = [...usedTokens.keys()]
  .filter(token => !requiredTokens.includes(token))
  .sort();
for (const token of undefinedTokens) {
  const files = [...usedTokens.get(token)].sort();
  errors.push(`used token ${token} is not declared in tokens.contract.css (used in ${files.join(', ')})`);
}

for (const entry of packageDirs.filter(item => item.isDirectory() && item.name !== 'shared')) {
  const id = entry.name;
  const manifestPath = join(packageRoot, id, 'manifest.ts');

  let manifest;
  try {
    manifest = await readFile(manifestPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      warnings.push(`${id}: package directory has no manifest.ts`);
      continue;
    }
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

  const manifestId = manifest.match(/\bid:\s*'([^']+)'/)?.[1];
  const target = manifest.match(/target:\s*'(public|dashboard)'/)?.[1];
  const defaultMode = manifest.match(/defaultMode:\s*'(light|dark)'/)?.[1];
  const modeList = manifest.match(/appearanceModes:\s*\[([^\]]+)\]/)?.[1] || '';
  const declaredModes = [...modeList.matchAll(/'(light|dark)'/g)].map(match => match[1]);
  if (manifestId !== id) errors.push(id + ': manifest id is missing or does not match its package directory');
  if (!target) errors.push(id + ': manifest target is missing or invalid');
  if (!declaredModes.length) errors.push(id + ': appearanceModes must declare at least one supported mode');
  if (new Set(declaredModes).size !== declaredModes.length) errors.push(id + ': appearanceModes contains duplicate entries');
  if (!defaultMode || !declaredModes.includes(defaultMode)) errors.push(id + ': defaultMode must be included in appearanceModes');

  const modeAttribute = target === 'public' ? 'public' : 'dashboard';
  const blocks = new Map();
  const blockValues = new Map();
  const blockCounts = new Map();
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of tokens.matchAll(blockPattern)) {
    const selectors = match[1];
    if (!selectors.includes('.bee-template-package-host[data-bee-template="' + id + '"][data-bee-' + modeAttribute + '-mode="')) continue;
    const mode = selectors.match(/data-bee-(?:public|dashboard)-mode="(light|dark)"/)?.[1];
    if (!mode) continue;
    blockCounts.set(mode, (blockCounts.get(mode) || 0) + 1);
    const htmlSelector = 'html[data-bee-active-template="' + id + '"][data-bee-active-mode="' + mode + '"]';
    if (!selectors.includes(htmlSelector)) errors.push(id + ': ' + mode + ' block is missing html active-template scope');
    const selectorTarget = selectors.match(/data-bee-(public|dashboard)-mode=/)?.[1];
    if (selectorTarget !== modeAttribute) errors.push(id + ': ' + mode + ' block uses data-bee-' + selectorTarget + '-mode but target is ' + target);
    const declarations = [...match[2].matchAll(/^\s*(--bee-[\w-]+)\s*:/gm)].map(item => item[1]);
    const declared = new Set(declarations);
    const declarationCounts = new Map();
    for (const token of declarations) declarationCounts.set(token, (declarationCounts.get(token) || 0) + 1);
    for (const [token, count] of declarationCounts) {
      if (count > 1) errors.push(id + ': ' + mode + ' declares ' + token + ' ' + count + ' times');
    }
    blocks.set(mode, declared);
    const modeValues = new Map([...match[2].matchAll(/^\s*(--bee-[\w-]+)\s*:\s*([^;]+);?/gm)].map(item => [item[1], item[2].trim()]));
    blockValues.set(mode, modeValues);
  }

  for (const [mode, count] of blockCounts) {
    if (count > 1) errors.push(id + ': duplicate ' + mode + ' token blocks (' + count + ')');
    if (!declaredModes.includes(mode)) errors.push(id + ': ' + mode + ' token block is not declared in appearanceModes');
  }

  for (const mode of declaredModes) {
    const declared = blocks.get(mode);
    if (!declared) {
      errors.push(`${id}: missing ${mode} token block`);
      continue;
    }
    const missing = requiredTokens.filter(token => !declared.has(token));
    const unknown = [...declared].filter(token => !requiredTokens.includes(token)).sort();
    if (missing.length) errors.push(`${id}: ${mode} is missing ${missing.join(', ')}`);
    if (unknown.length) errors.push(id + ': ' + mode + ' declares tokens outside tokens.contract.css: ' + unknown.join(', '));
  }
  results.push({ id, target, defaultMode, appearanceModes: declaredModes, tokenBlocks: [...blocks.keys()] });
  contrastPackages.push({ id, blockValues });
}


function parseColor(input, values, depth = 0) {
  if (typeof input !== 'string' || depth > 8) return null;
  const value = input.trim();
  if (value.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const variable = value.match(/^var\(\s*(--bee-[\w-]+)\s*\)$/);
  if (variable) return parseColor(values.get(variable[1]), values, depth + 1);
  const hexMatch = value.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length <= 4) hex = [...hex].map(char => char + char).join('');
    const hasAlpha = hex.length === 8;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hasAlpha ? parseInt(hex.slice(6, 8), 16) / 255 : 1
    };
  }
  const rgbMatch = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (rgbMatch) {
    const alphaText = rgbMatch[4] || '1';
    const alpha = alphaText.endsWith('%') ? Number(alphaText.slice(0, -1)) / 100 : Number(alphaText);
    return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]), a: alpha };
  }
  const mixMatch = value.match(/^color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)(?:\s+([\d.]+)%)?\s*\)$/i);
  if (mixMatch) {
    const first = parseColor(mixMatch[1], values, depth + 1);
    const second = parseColor(mixMatch[3], values, depth + 1);
    if (!first || !second) return null;
    const firstWeight = Number(mixMatch[2]) / 100;
    const secondWeight = mixMatch[4] === undefined ? 1 - firstWeight : Number(mixMatch[4]) / 100;
    const alpha = first.a * firstWeight + second.a * secondWeight;
    if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (first.r * first.a * firstWeight + second.r * second.a * secondWeight) / alpha,
      g: (first.g * first.a * firstWeight + second.g * second.a * secondWeight) / alpha,
      b: (first.b * first.a * firstWeight + second.b * second.a * secondWeight) / alpha,
      a: alpha
    };
  }
  return null;
}
function composite(foreground, background) {
  const alpha = foreground.a;
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
    a: 1
  };
}
function visibleToken(token, values, backdrop) {
  const parsed = parseColor(values.get(token), values);
  if (!parsed) return null;
  if (parsed.a >= 1) return parsed;
  return backdrop ? composite(parsed, backdrop) : null;
}
function luminance(color) {
  const channels = [color.r, color.g, color.b].map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function ratio(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
if (contrastReport || contrastBlocking) {
  const contrastConfig = JSON.parse(await readFile('scripts/template-contrast.config.json', 'utf8'));
  const pairs = [
    { name: 'text / bg', foreground: '--bee-text', background: '--bee-bg', threshold: 4.5 },
    { name: 'text / surface', foreground: '--bee-text', background: '--bee-surface', backdrop: '--bee-bg', threshold: 4.5 },
    { name: 'text-muted / surface', foreground: '--bee-text-muted', background: '--bee-surface', backdrop: '--bee-bg', threshold: 4.5 },
    { name: 'accent-text / accent', foreground: '--bee-accent-text', background: '--bee-accent', threshold: 4.5 },
    { name: 'success / success-soft', foreground: '--bee-status-success', background: '--bee-status-success-soft', backdrop: '--bee-surface', backdropBase: '--bee-bg', threshold: 4.5 },
    { name: 'warning / warning-soft', foreground: '--bee-status-warning', background: '--bee-status-warning-soft', backdrop: '--bee-surface', backdropBase: '--bee-bg', threshold: 4.5 },
    { name: 'danger / danger-soft', foreground: '--bee-status-danger', background: '--bee-status-danger-soft', backdrop: '--bee-surface', backdropBase: '--bee-bg', threshold: 4.5 },
    { name: 'info / info-soft', foreground: '--bee-status-info', background: '--bee-status-info-soft', backdrop: '--bee-surface', backdropBase: '--bee-bg', threshold: 4.5 },
    { name: 'link / bg', foreground: '--bee-link', background: '--bee-bg', threshold: 4.5 },
    { name: 'input-placeholder / input-bg', foreground: '--bee-input-placeholder', background: '--bee-input-bg', backdrop: '--bee-bg', threshold: 3 },
    { name: 'focus-ring / bg', foreground: '--bee-focus-ring', background: '--bee-bg', threshold: 3 }
  ];
  const rows = [];
  let blockingFailures = 0;
  for (const pkg of contrastPackages) {
    for (const [mode, values] of pkg.blockValues) {
      const pageBackground = visibleToken('--bee-bg', values, null);
      const surface = visibleToken('--bee-surface', values, pageBackground);
      for (const pair of pairs) {
        const backdrop = pair.backdrop
          ? (pair.backdropBase ? visibleToken(pair.backdrop, values, pageBackground) : pair.backdrop === '--bee-surface' ? surface : visibleToken(pair.backdrop, values, pageBackground))
          : null;
        const background = visibleToken(pair.background, values, backdrop);
        const foregroundColor = parseColor(values.get(pair.foreground), values);
        const foreground = foregroundColor && background
          ? (foregroundColor.a < 1 ? composite(foregroundColor, background) : foregroundColor)
          : null;
        const measured = foreground && background ? ratio(foreground, background) : null;
        const exception = (contrastConfig.exceptions || []).find(item => item.package === pkg.id && item.mode === mode && item.pair === pair.name);
        let result;
        if (measured === null || !Number.isFinite(measured)) result = 'SKIPPED (non-solid)';
        else if (measured >= pair.threshold) result = 'PASS';
        else if (exception) result = 'EXCEPTION: ' + exception.reason;
        else { result = 'FAIL'; blockingFailures += 1; }
        rows.push({ package: pkg.id, mode, pair: pair.name, ratio: measured === null ? '—' : measured.toFixed(2), threshold: pair.threshold.toFixed(1) + ':1', result });
      }
    }
  }
  console.log('WCAG 2.x template contrast report');
  console.log('| package | mode | pair | ratio | threshold | result |');
  console.log('|---|---|---|---:|---:|---|');
  for (const row of rows) console.log('| ' + row.package + ' | ' + row.mode + ' | ' + row.pair + ' | ' + row.ratio + ' | ' + row.threshold + ' | ' + row.result + ' |');
  const skipped = rows.filter(row => row.result.startsWith('SKIPPED')).length;
  console.log('Contrast pairs: ' + rows.length + '; skipped (non-solid): ' + skipped + '; blocking failures: ' + blockingFailures + '.');
  if (contrastBlocking && blockingFailures) process.exitCode = 1;
}

console.log(JSON.stringify({ requiredTokenCount: requiredTokens.length, packages: results, warnings, errors }, null, 2));
if (errors.length) process.exitCode = 1;
