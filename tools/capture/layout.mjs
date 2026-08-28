// Layout assertions across the device matrix.
//
//   node tools/capture/layout.mjs
//
// Screenshots prove what a thing LOOKS like. They are a poor way to prove a
// button is 44 points, that two boxes do not overlap by three pixels, or that
// nothing has crept into the home-indicator strip — those are measurements, and
// a person reviewing forty images will miss them. This reads the real
// getBoundingClientRect of every element in every state on every viewport in
// both landscape orientations and fails on the numbers.
//
// What it checks:
//   TARGETS   every interactive control is at least 44x44 CSS px (Apple HIG)
//   SAFE      nothing interactive sits inside a safe-area inset or in the
//             bottom 20px where the iOS home-indicator swipe lives
//   OVERLAP   pairs that must never overlap, do not
//   BOUNDS    nothing is off-screen, and nothing that must be reachable is
//             below the fold
//   HOVER     no :hover-dependent styling anywhere in the stylesheet
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DEVICES, insetsFor, viewportFor } from './devices.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const PORT = Number(process.env.PORT || 8080);
const ORIGIN = `http://127.0.0.1:${PORT}/Strongest-Man/`;
const MIN_TARGET = 44;
const HOME_INDICATOR = 20;

function findChrome() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium') && !d.includes('headless_shell')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      try { readdirSync(join(base, d, 'chrome-linux')); return p; } catch { /* keep looking */ }
    }
  }
  throw new Error('chromium not found');
}

async function serverUp() {
  try { return (await fetch(ORIGIN)).ok; } catch { return false; }
}

let server = null;
if (!(await serverUp())) {
  server = spawn(process.execPath, [join(root, 'tools', 'test', 'serve.mjs')], { stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await serverUp()); i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 100));
  }
}

// ---- states to measure ------------------------------------------------------
// ONE page per viewport, walked through every state in order. A fresh page per
// state meant seventy full game boots under a software rasterizer, which is
// forty minutes of nothing; `enter` gets to each state from the one before it.
// `leave` puts it back so the next `enter` starts from a known place.
const STATES = [
  {
    id: 'hud',
    enter: () => window.__test.hudStress(),
    controls: ['#btn-punch', '#btn-jump', '#btn-grab', '#btn-interact', '#btn-pause', '#btn-gallery'],
    // pairs that must not overlap, and why each pair matters
    noOverlap: [
      ['#toast', '#btns'],
      ['#toast', '#btn-gallery'],
      ['#toast', '#btn-pause'],
      // the tight one: the two survivors of the top-right cluster, 10px apart
      ['#btn-pause', '#btn-gallery'],
      ['#chat', '#btn-gallery'],
      ['#chat', '#btns'],
    ],
  },
  {
    id: 'museum',
    enter: () => {
      const w = window.__test.museum().works[0];
      window.__test.warpTo(w.viewX, w.viewZ, Math.atan2(w.viewX - w.x, w.viewZ - w.z));
      window.__test.step(0.5);
    },
    controls: ['#art-prompt', '#btn-punch', '#btn-pause'],
    // The prompt is centred and the cluster is pinned right; its max-width is
    // derived to keep them apart at every viewport, and this is the assertion
    // that keeps that derivation honest.
    noOverlap: [['#art-prompt', '#btns'], ['#art-prompt', '#btn-gallery']],
  },
  {
    id: 'update',
    enter: () => {
      document.getElementById('update-banner').hidden = false;
      document.getElementById('update-dismiss').hidden = false;
      document.body.classList.add('has-update');
    },
    leave: () => {
      document.getElementById('update-banner').hidden = true;
      document.getElementById('update-dismiss').hidden = true;
      document.body.classList.remove('has-update');
    },
    controls: ['#update-banner', '#update-dismiss'],
    noOverlap: [['#update-banner', '#update-dismiss'], ['#update-banner', '#toast'], ['#update-banner', '#btn-gallery']],
  },
  {
    id: 'pause',
    enter: () => document.getElementById('btn-pause').click(),
    controls: ['#btn-resume', '#btn-pause-settings'],
    mustBeOnScreen: ['#btn-resume', '#btn-pause-settings', '#pause-panel'],
    noOverlap: [],
  },
  {
    id: 'settings',
    // reached from the pause screen, which is where it is left standing
    enter: () => document.getElementById('btn-pause-settings').click(),
    leave: () => document.getElementById('btn-settings-done').click(),
    controls: ['#btn-settings-done', '#btn-groq-test', '#set-quality', '#set-groq', '#set-sens', '#set-invy', '#set-audio'],
    mustBeOnScreen: ['#btn-settings-done', '#settings-panel'],
    noOverlap: [],
  },
  {
    id: 'chat',
    enter: async () => { window.__test.step(1); window.__test.talk(); await new Promise((r) => setTimeout(r, 400)); },
    leave: () => document.getElementById('chat-close').click(),
    controls: ['#chat-close', '#chat-send', '#chat-input'],
    noOverlap: [['#chat', '#btns'], ['#chat', '#btn-gallery']],
    optional: true,   // needs an NPC in range; skipped when there is not one
  },
];

const failures = [];
const measured = [];
function fail(msg) { failures.push(msg); }

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

// ---- a static check that needs no browser ----------------------------------
{
  const css = readFileSync(join(root, 'css', 'main.css'), 'utf8');
  // :hover sticks after a tap on iOS and leaves the control visually pressed
  // with no way to clear it. There must not be any.
  const hovers = css.split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /:hover/.test(l) && !/^\s*\/\*/.test(l));
  for (const [n, l] of hovers) fail(`css/main.css:${n} uses :hover — ${l.trim()}`);
}

for (const device of DEVICES) {
  for (const orientation of ['landscape-left', 'landscape-right']) {
    const vp = viewportFor(device, orientation);
    const insets = insetsFor(device, orientation);
    const ctx = await browser.newContext({
      viewport: vp,
      deviceScaleFactor: device.dpr,
      isMobile: device.id !== 'desktop',
      hasTouch: device.id !== 'desktop',
      serviceWorkers: 'block',
    });
    // Safe-area insets, plus: no CSS transitions or animations.
    //
    // The transition kill is not cosmetic here, it decides whether a check runs
    // at all. boxes() drops anything at computed opacity 0, and #art-prompt
    // fades in over 0.18s on the wall clock while the state setup advances the
    // SIM by a fixed 0.5s — two different clocks. So whether the prompt was
    // measured depended on which side of the fade the two rAFs landed on, and
    // on the runs where it landed at exactly 0 the report said "none visible"
    // and the #art-prompt overlap assertions — the regression guard for
    // AUDIT.md #110 — silently did not run. A check that sometimes does not
    // happen is worse than one that fails. Killing the transitions puts every
    // DOM overlay at its settled state, which is the state worth measuring.
    await ctx.addInitScript(`(() => {
      const css = ':root{--sa-t:${insets.top}px;--sa-r:${insets.right}px;'
        + '--sa-b:${insets.bottom}px;--sa-l:${insets.left}px;}'
        + '*,*::before,*::after{transition:none!important;animation:none!important;}';
      const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
      if (document.head) add(); else addEventListener('DOMContentLoaded', add);
    })()`);

    const page = await ctx.newPage();
    let booted = false;
    try {
      await page.goto(`${ORIGIN}?autoplay=1&seed=42&capture=1&nomonsters=1&nogroq=1&warp=museum`,
        { waitUntil: 'load' });
      await page.waitForFunction('window.__READY__ === true', null, { timeout: 300000 });
      booted = true;
    } catch (e) {
      fail(`${device.id} ${orientation}: boot failed — ${String(e).split('\n')[0]}`);
    }

    for (const st of STATES) {
      if (!booted) break;
      const where = `${st.id} ${device.id} ${orientation}`;
      try {
        if (st.enter) await page.evaluate(st.enter);
        await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');

        const report = await page.evaluate(({ controls, noOverlap, mustBeOnScreen, insets: ins, minTarget, homeIndicator }) => {
          // An element scrolled out of a panel is not "under the notch" — it is
          // simply not on screen. Position checks apply only to what is
          // actually visible inside its nearest scrolling ancestor; SIZE checks
          // apply either way, because a 28px target is 28px wherever it is.
          const clipper = (e) => {
            for (let n = e.parentElement; n; n = n.parentElement) {
              const cs = getComputedStyle(n);
              if (/(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX)) return n;
            }
            return null;
          };
          const boxes = (sel) => [...document.querySelectorAll(sel)]
            .filter((e) => {
              const r = e.getBoundingClientRect();
              const cs = getComputedStyle(e);
              return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden'
                && cs.display !== 'none' && cs.opacity !== '0';
            })
            .map((e) => {
              const r = e.getBoundingClientRect();
              // Position checks run against the rect CLIPPED to the scroll
              // container, not the raw one: half a button hanging below the
              // panel's own bottom edge is not half a button under the home
              // indicator, it is half a button the panel is not showing.
              const c = clipper(e);
              let x = r.left, y = r.top, rr = r.right, bb = r.bottom;
              let onScreen = true;
              if (c) {
                const cr = c.getBoundingClientRect();
                x = Math.max(x, cr.left); y = Math.max(y, cr.top);
                rr = Math.min(rr, cr.right); bb = Math.min(bb, cr.bottom);
                onScreen = rr - x > 0.5 && bb - y > 0.5;
              }
              // w/h stay the element's OWN size — a 28px target is 28px
              // wherever it happens to be scrolled to.
              return { sel, x, y, w: r.width, h: r.height, r: rr, b: bb, onScreen };
            });
          const out = { small: [], outside: [], indicator: [], overlaps: [], offscreen: [], seen: [] };
          const vw = innerWidth, vh = innerHeight;
          for (const sel of controls) {
            const bs = boxes(sel);
            if (!bs.length) { out.seen.push(`${sel}: none visible`); continue; }
            for (const b of bs) {
              out.seen.push(`${sel} ${b.w.toFixed(1)}x${b.h.toFixed(1)}${b.onScreen ? '' : ' (scrolled out)'}`);
              if (b.w < minTarget - 0.5 || b.h < minTarget - 0.5) out.small.push(b);
              if (!b.onScreen) continue;
              if (b.x < ins.left - 0.5 || b.r > vw - ins.right + 0.5
                  || b.y < ins.top - 0.5 || b.b > vh - ins.bottom + 0.5) out.outside.push(b);
              // Only a device that HAS a home indicator has a home-indicator
              // strip. On a Touch ID phone or a desktop the bottom inset is 0
              // and the bottom 20px is ordinary screen.
              if (ins.bottom > 0 && b.b > vh - homeIndicator + 0.5) out.indicator.push(b);
            }
          }
          for (const [a, c] of noOverlap) {
            for (const ba of boxes(a)) {
              for (const bc of boxes(c)) {
                if (ba.x < bc.r && ba.r > bc.x && ba.y < bc.b && ba.b > bc.y) {
                  out.overlaps.push({ a, c, ax: ba.x, ar: ba.r, ay: ba.y, ab: ba.b, cx: bc.x, cr: bc.r, cy: bc.y, cb: bc.b });
                }
              }
            }
          }
          for (const sel of mustBeOnScreen || []) {
            const bs = boxes(sel);
            if (!bs.length) { out.offscreen.push(`${sel}: not rendered`); continue; }
            for (const b of bs) {
              // These are the ways OUT of a modal, so being scrolled out of the
              // panel is exactly the failure — .btnrow is sticky for that reason.
              if (!b.onScreen || b.b > vh + 0.5 || b.y < -0.5 || b.r > vw + 0.5 || b.x < -0.5) {
                out.offscreen.push(`${sel} at ${b.x.toFixed(0)},${b.y.toFixed(0)} ${b.w.toFixed(0)}x${b.h.toFixed(0)} vs ${vw}x${vh}`);
              }
            }
          }
          return out;
        }, {
          controls: st.controls, noOverlap: st.noOverlap || [],
          mustBeOnScreen: st.mustBeOnScreen, insets, minTarget: MIN_TARGET, homeIndicator: HOME_INDICATOR,
        });

        measured.push({ where, seen: report.seen });
        for (const b of report.small) fail(`${where}: ${b.sel} is ${b.w.toFixed(1)}x${b.h.toFixed(1)}, under ${MIN_TARGET}`);
        for (const b of report.outside) fail(`${where}: ${b.sel} breaks the safe box (${b.x.toFixed(0)},${b.y.toFixed(0)} ${b.w.toFixed(0)}x${b.h.toFixed(0)}) insets l${insets.left} r${insets.right} b${insets.bottom}`);
        for (const b of report.indicator) fail(`${where}: ${b.sel} reaches into the home-indicator strip (bottom ${b.b.toFixed(1)} of ${vp.height})`);
        for (const o of report.overlaps) fail(`${where}: ${o.a} overlaps ${o.c} (${o.ax.toFixed(0)}..${o.ar.toFixed(0)} x ${o.ay.toFixed(0)}..${o.ab.toFixed(0)} vs ${o.cx.toFixed(0)}..${o.cr.toFixed(0)} x ${o.cy.toFixed(0)}..${o.cb.toFixed(0)})`);
        for (const o of report.offscreen) fail(`${where}: ${o} is off-screen and it must not be`);
        process.stdout.write(report.small.length || report.overlaps.length || report.offscreen.length
          || report.outside.length || report.indicator.length ? 'x' : '.');
      } catch (e) {
        if (!st.optional) fail(`${where}: ${String(e).split('\n')[0]}`);
        process.stdout.write(st.optional ? 's' : 'E');
      }
      if (st.leave) await page.evaluate(st.leave).catch(() => {});
    }
    await page.close();
    await ctx.close();
  }
}

await browser.close();
if (server) server.kill();

writeFileSync(join(root, 'screenshots', 'layout-report.json'),
  `${JSON.stringify({ failures, measured }, null, 2)}\n`);

console.log(`\n${failures.length} layout failure(s)`);
for (const f of failures) console.log(`  ${f}`);
process.exit(failures.length ? 1 : 0);
