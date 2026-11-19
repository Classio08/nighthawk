// GUARD: src/sim must stay a graphics-free, deterministic core. The same code runs in solo play, on the server and in the browser's
// predictor, so ONE hidden browser call or wall-clock read makes the three disagree. This test scans the source text.
// An intentional exception needs a `purity-ok: why` comment on the same line (keep those rare and explained).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIM = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'sim');
const files = readdirSync(SIM).filter((f) => f.endsWith('.js'));

// what must never appear in sim code (checked on code with comments and string literals removed)
const FORBIDDEN = [
  [/\bMath\.random\b/, 'Math.random (use the seeded rng from rng.js)'],
  [/\bDate\.now\b|\bnew Date\b/, 'wall-clock time (the sim advances only by its own fixed dt)'],
  [/\bperformance\.now\b/, 'performance.now (wall-clock time)'],
  [/\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b/, 'timers (use sim time)'],
  [/\bwindow\b|\bdocument\b|\blocalStorage\b|\bsessionStorage\b|\bnavigator\b/, 'a browser global'],
  [/\bAudioContext\b|\bWebSocket\b|\bfetch\s*\(/, 'audio / network I/O'],
];
// the only things sim files may import (besides their own siblings)
const ALLOWED_IMPORTS = [/^\.\/[\w-]+\.js$/, /^yuka$/, /^@dimforge\/rapier3d-compat$/, /^\.\.\/input\/move\.js$/, /^\.\.\/\.\.\/data\/[\w-]+\.json$/];

/** blank out comments and string / template literals so words inside them do not trigger the scan (line structure is kept) */
function stripNoise(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length))
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, (m) => m[0] + ' '.repeat(Math.max(0, m.length - 2)) + m[m.length - 1]);
}

test('sim purity: no browser globals, wall-clock time or unseeded randomness in src/sim', () => {
  assert.ok(files.length >= 15, `expected the sim files, found ${files.length}`);
  const problems = [];
  for (const f of files) {
    const raw = readFileSync(join(SIM, f), 'utf8').split('\n'), clean = stripNoise(raw.join('\n')).split('\n');
    clean.forEach((line, i) => {
      if (raw[i].includes('purity-ok')) return;
      for (const [re, what] of FORBIDDEN) if (re.test(line)) problems.push(`src/sim/${f}:${i + 1}  ${what}   ${raw[i].trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(problems, [], '\n' + problems.join('\n'));
});

test('sim purity: src/sim imports only its own files, yuka, rapier, the shared move helper and data json', () => {
  const problems = [];
  for (const f of files) {
    const src = readFileSync(join(SIM, f), 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm)) {
      if (!ALLOWED_IMPORTS.some((re) => re.test(m[1]))) problems.push(`src/sim/${f} imports '${m[1]}' (the sim must not depend on rendering, audio, UI, networking or three.js)`);
    }
    for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)) problems.push(`src/sim/${f} uses a dynamic import of '${m[1]}'`);
  }
  assert.deepEqual(problems, [], '\n' + problems.join('\n'));
});

test('sim purity: the scanner itself catches violations (and ignores comments and strings)', () => {
  const bad = stripNoise('const t = performance.now(); // fine here\nconst s = "window";\nfoo(Math.random());');
  assert.ok(FORBIDDEN.some(([re]) => re.test(bad.split('\n')[0])), 'performance.now must be flagged');
  assert.ok(!FORBIDDEN.some(([re]) => re.test(bad.split('\n')[1])), 'a string literal must not be flagged');
  assert.ok(FORBIDDEN.some(([re]) => re.test(bad.split('\n')[2])), 'Math.random must be flagged');
  assert.ok(!FORBIDDEN.some(([re]) => re.test(stripNoise('x(); // Date.now in a comment').split('\n')[0])), 'a comment must not be flagged');
});
