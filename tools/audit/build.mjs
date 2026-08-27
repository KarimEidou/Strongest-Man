// AUDIT.md is generated. Do not edit it by hand — edit the data and re-run:
//
//   node tools/audit/build.mjs
//
//   findings.json   one object per defect, written when it was reproduced:
//                   title, severity, category, file, line, evidence, repro,
//                   expected, actual, fix
//   commits.json    finding id -> the short SHA where the behaviour changed
//
// The commit legend is read out of git, so it stays right when history is
// rewritten or a SHA is corrected — and a finding pointing at a commit that is
// not on this branch is a hard error rather than a broken link in a table.
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const BASE = 'origin/pre-overhaul-2026-08-26';

const findings = JSON.parse(readFileSync(join(here, 'findings.json'), 'utf8'));
const commits = JSON.parse(readFileSync(join(here, 'commits.json'), 'utf8'));

// Two sweeps covered the touch/CSS surface and recorded some of the same
// defects twice, one with absolute paths and one relative. Merged here, both
// ids kept so nothing silently vanishes from the count.
const DUPES = { 46: 26, 50: 27, 49: 41 };
const UMBRELLA = { 54: [32, 33, 34, 35, 36, 37, 38] };

const rel = (f) => (f || '').replace('/home/user/Strongest-Man/', '');
const trim = (s, n) => {
  if (!s) return '—';
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const SEV_ORDER = { Blocker: 0, Major: 1, Minor: 2, Polish: 3 };
const rows = findings.map((f, i) => ({ id: i + 1, ...f }));
const merged = rows.filter((r) => !DUPES[r.id]);

// commit subjects, in the order this branch made them
let log = [];
try {
  log = execFileSync('git', ['log', '--format=%h%x09%s', `${BASE}..HEAD`], { cwd: root })
    .toString().trim().split('\n').reverse().map((l) => l.split('\t'));
} catch {
  console.error(`build.mjs: could not read git log against ${BASE}; is the branch fetched?`);
  process.exit(2);
}
const known = new Map(log);
const used = new Set(Object.values(commits));
const missing = [...used].filter((c) => !known.has(c));
if (missing.length) {
  console.error(`build.mjs: ${missing.length} commit(s) in commits.json are not on this branch: ${missing.join(', ')}`);
  process.exit(1);
}
const unmapped = merged.filter((r) => !commits[String(r.id)]);
if (unmapped.length) {
  console.error(`build.mjs: ${unmapped.length} finding(s) have no resolving commit: ${unmapped.map((r) => r.id).join(', ')}`);
  process.exit(1);
}

const baseSha = execFileSync('git', ['rev-parse', '--short', BASE], { cwd: root }).toString().trim();

const out = [];
const P = (...lines) => out.push(...lines);

P('# Audit',
  '',
  '**Generated — `node tools/audit/build.mjs`. Edit `tools/audit/findings.json`, not this file.**',
  '',
  'Every defect found in the pre-overhaul build, what proves it, and the commit',
  'that resolves it. Nothing here is aspirational: an entry exists because the',
  'behaviour was reproduced against the running game, and it carries a commit',
  'because the behaviour was reproduced again afterwards and had changed.',
  '',
  `The baseline is the branch \`pre-overhaul-2026-08-26\` (commit \`${baseSha}\`). Line`,
  "numbers are that build's, not the current tree's.",
  '',
  '## How this was found',
  '',
  '- Every module read end to end, worst-first by blast radius: the shared material,',
  '  the frame loop, the physics world, the service worker.',
  '- The running game instrumented rather than reasoned about — `shaderSource` hooked',
  '  before boot to read what actually compiled, `renderer.info` sampled across scene',
  '  cycles, `getBoundingClientRect` measured for every control in every state on',
  '  five viewports in both orientations.',
  '- Console output treated as a defect list. The baseline logs a problem on **every',
  '  one of its 90 captured screens** (`screenshots/baseline-report.json`).',
  '- Each candidate reproduced before it was written down, and re-reproduced after',
  '  the fix. Findings that did not survive that step are not in this document.',
  '- **The screenshots were then reviewed, and reviewing them found more.** Seven',
  '  entries here (#107–#113) exist because 622 captures were looked at rather',
  '  than counted: a museum label with a hole under it, an armed weapon chip half',
  '  off the screen, five wall-clock timers running behind the pause panel, a',
  '  prompt drawn over the ammo readout at 667×375, a loading screen that comes',
  '  down five seconds before there is anything behind it, a solid wooden door',
  '  across every entrance the player is meant to walk through, and four scenes',
  '  whose stated purpose is to show the artwork and which showed the back of the',
  '  man standing in front of it. §5.7 of the brief asks for that pass because it',
  '  is the one that finds these; it is not a formality.',
  '- **And making a test honest found two more.** #114 and #115 came out of the',
  '  service-worker upgrade test after its own two defects were corrected: an',
  '  update offer with a hole in the middle of it, and a boot watchdog that',
  '  reported a slow first install to the player as a failure. Neither was',
  '  reachable without driving a real worker through a real deploy.',
  '',
  '**Reading an entry.** *Repro* is the exact steps that produced the behaviour.',
  '*Expected* and *Actual* are what should happen and what did, with the mechanism.',
  '*Remedy* is the fix identified when the defect was written up — where the commit',
  'took a different route to the same outcome, the commit message says which and why.',
  'The commit named is where the behaviour actually changed.',
  '');

const bySev = {}; for (const r of merged) bySev[r.severity] = (bySev[r.severity] || 0) + 1;
const byCat = {}; for (const r of merged) byCat[r.category] = (byCat[r.category] || 0) + 1;

P('## Counts', '',
  '| Severity | Count | Meaning |', '|---|---:|---|',
  `| Blocker | ${bySev.Blocker || 0} | the game or the deploy is broken for someone |`,
  `| Major | ${bySev.Major || 0} | a feature does not work, leaks, or is unusable on the target device |`,
  `| Minor | ${bySev.Minor || 0} | wrong, but survivable |`,
  `| Polish | ${bySev.Polish || 0} | correct, and not good enough |`,
  `| **Total** | **${merged.length}** | from ${findings.length} raw findings; ${Object.keys(DUPES).length} were the same defect seen by two sweeps |`,
  '',
  '| Category | Count |', '|---|---:|');
for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) P(`| ${k} | ${v} |`);
P('');

P('## Resolving commits', '', '| Commit | Subject |', '|---|---|');
for (const [h, subject] of log) if (used.has(h)) P(`| \`${h}\` | ${subject} |`);
P('');

const sorted = [...merged].sort((a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) || (a.id - b.id));

P('## Index', '', '| # | Sev | Category | Where | Defect | Commit |', '|---:|---|---|---|---|---|');
for (const r of sorted) {
  P(`| ${r.id} | ${r.severity} | ${r.category} | \`${rel(r.file)}:${r.line}\` | ${trim(r.title, 96).replace(/\|/g, '\\|')} | \`${commits[String(r.id)]}\` |`);
}
P('', '---', '', '## Detail', '');

for (const r of sorted) {
  const dupes = Object.entries(DUPES).filter(([, v]) => v === r.id).map(([k]) => k);
  P(`### ${r.id}. ${r.title}`, '',
    `**${r.severity} · ${r.category} · \`${rel(r.file)}:${r.line}\` · fixed in \`${commits[String(r.id)]}\`**`);
  if (dupes.length) P('', `*Also recorded as ${dupes.map((d) => `#${d}`).join(', ')} by the second sweep.*`);
  if (UMBRELLA[r.id]) P('', `*Umbrella over ${UMBRELLA[r.id].map((d) => `#${d}`).join(', ')}, each measured individually.*`);
  P('', `**Repro.** ${trim(r.repro, 900)}`, '', `**Expected.** ${trim(r.expected, 500)}`, '',
    `**Actual.** ${trim(r.actual, 900)}`, '', `**Remedy.** ${trim(r.fix, 700)}`, '');
}

P('---', '',
  '## What is not in here', '',
  '- **Physical-device results.** Everything above was reproduced in Chromium and',
  '  WebKit at real iPhone viewports with real safe-area insets injected. No iPhone',
  '  was available to this environment. `BLOCKERS.md` says so in full, and the',
  '  distinction is never blurred: an emulator result is called an emulator result.',
  '- **Findings that did not survive verification.** A handful of suspicions did not',
  '  reproduce and were dropped rather than written up as fixes.',
  '');

writeFileSync(join(root, 'AUDIT.md'), `${out.join('\n')}\n`);
console.log(`AUDIT.md: ${merged.length} entries from ${findings.length} findings, ${[...used].length} commits`);
