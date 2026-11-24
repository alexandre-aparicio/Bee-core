#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

const root = process.argv[2] || 'src';
const includeExtensions = new Set(['.css', '.scss', '.ts', '.html']);
const excludedDirectories = new Set(['node_modules', 'dist', '.git', 'coverage', 'playwright-report', 'test-results']);
const patterns = {
  hex: /#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})\b/gi,
  rgbHsl: /\b(?:rgba?|hsla?)\s*\(/gi,
  important: /!important\b/gi,
  dashboardPrefixes: /\b(?:md|pd|gd)-[a-zA-Z][\w-]*/g,
  legacyTokens: /--(?:bg|panel|muted|border|purple|cyan)\b/g
};

const files = [];
async function walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) await walk(join(directory, entry.name));
      continue;
    }
    if (entry.isFile() && includeExtensions.has(extname(entry.name))) files.push(join(directory, entry.name));
  }
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

await walk(root);
const totals = Object.fromEntries(Object.keys(patterns).map(key => [key, 0]));
const inventory = [];

for (const file of files.sort()) {
  const source = await readFile(file, 'utf8');
  const metrics = {
    file: relative(process.cwd(), file).replaceAll('\\\\', '/'),
    lines: source.split(/\r?\n/).length,
    ...Object.fromEntries(Object.entries(patterns).map(([key, pattern]) => [key, count(source, pattern)]))
  };
  for (const key of Object.keys(patterns)) totals[key] += metrics[key];
  if (Object.values(metrics).some((value, index) => index > 1 && value > 0)) inventory.push(metrics);
}

console.log(JSON.stringify({
  root,
  scannedFiles: files.length,
  totals,
  files: inventory
}, null, 2));
