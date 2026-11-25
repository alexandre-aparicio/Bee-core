#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, extname, sep } from 'node:path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const root = args.find(value => !value.startsWith('--')) || 'src';
const extensions = new Set(['.css', '.ts', '.html']);
const excluded = new Set(['node_modules', 'dist', '.git', 'coverage', 'playwright-report', 'test-results']);
const patterns = {
  hex: /#(?:[\\da-f]{3,4}|[\\da-f]{6}|[\\da-f]{8})\\b/gi,
  colorFunctions: /\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\s*\\(/gi,
  important: /!important\\b/gi,
  classSubstring: /\\[class\\s*\\*=/gi,
  dashboardPrefixes: /\\b(?:md|pd|gd)-[a-zA-Z][\\w-]*/g,
  legacyTokens: /--(?:bg|panel|muted|border|purple|cyan)\\b/g
};
const namedColors = 'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(' ');
const colorProperties = '(?:color|background(?:-color)?|border(?:-[a-z-]+)?-color|outline(?:-color)?|text-decoration-color|fill|stroke|caret-color)';
const namedPattern = new RegExp('(?:^|[;{])\\\\s*' + colorProperties + '\\\\s*:\\\\s*[^;{}\\\\n]*?\\\\b(' + namedColors.join('|') + ')\\\\b', 'gim');
const config = JSON.parse(await readFile('scripts/style-guard.config.json', 'utf8'));
function matchesGlob(path, pattern) {
  const escaped = pattern.replace(/[.+^$()|[\\]\\\\]/g, '\\\\$&').replace(/\\*\\*/g, '§§').replace(/\\*/g, '[^/]*').replace(/§§\\//g, '(?:.*/)?').replace(/§§/g, '.*');
  return new RegExp('^' + escaped + '$').test(path.split(sep).join('/'));
}
const files = [];
async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !excluded.has(entry.name)) await walk(path);
    else if (entry.isFile() && extensions.has(extname(entry.name))) files.push(path);
  }
}
function collect(findings, source, file, rule, pattern) {
  for (const match of source.matchAll(pattern)) {
    const before = source.slice(0, match.index);
    findings.push({ file, line: before.split('\\n').length, column: match.index - before.lastIndexOf('\\n'), rule, match: match[0].trim().slice(0, 100) });
  }
}
await walk(root);
const findings = [];
const totals = Object.fromEntries([...Object.keys(patterns), 'namedColor'].map(key => [key, 0]));
let allowlistedFiles = 0;
for (const file of files.sort()) {
  const display = relative(process.cwd(), file).split(sep).join('/');
  const exception = (config.allowlist || []).find(item => matchesGlob(display, item.pattern));
  if (exception) { allowlistedFiles++; continue; }
  const source = await readFile(file, 'utf8');
  const local = [];
  for (const [rule, pattern] of Object.entries(patterns)) collect(local, source, display, rule, pattern);
  collect(local, source, display, 'namedColor', namedPattern);
  for (const item of local) { findings.push(item); totals[item.rule]++; }
}
console.log(JSON.stringify({ root, strict, scannedFiles: files.length, allowlistedFiles, totals, findings }, null, 2));
if (strict && findings.length) {
  for (const item of findings) console.error(item.file + ':' + item.line + ':' + item.column + ' [' + item.rule + '] ' + item.match);
  process.exitCode = 1;
}
