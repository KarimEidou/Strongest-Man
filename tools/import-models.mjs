// Third-party asset pipeline: CC0 model packs -> game GLBs.
//
// Everything here is Kenney (kenney.nl), CC0 — see assets/CREDITS.md, which this
// script regenerates. The packs hide their download behind a modal, so the zip
// URL is scraped off the asset page rather than guessed; downloads are cached in
// tools/.assetcache/ (gitignored) so a re-run is offline and instant.
//
// Each job merges the pack model down to ONE mesh with ONE material, because
// that is what the game's asset registry consumes: engine/assets.js
// staticGeometry() takes the first mesh it finds and bakes its world matrix, and
// world/props.js builds an InstancedMesh straight off it. Kenney's kits texture
// everything from a single shared palette atlas, so the join is lossless.
//
//   node tools/import-models.mjs [name ...]      (no args: everything)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, weld, prune, quantize, textureCompress, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { execFileSync } from 'child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync, readdirSync } from 'fs';
import { dirname, join as pjoin } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = pjoin(here, '..');
const CACHE = pjoin(here, '.assetcache');
mkdirSync(CACHE, { recursive: true });

const PACKS = {
  'city-kit-roads': { slug: 'city-kit-roads', dir: 'Models/GLB format' },
  'car-kit': { slug: 'car-kit', dir: 'Models/GLB format' },
  'city-kit-suburban': { slug: 'city-kit-suburban', dir: 'Models/GLB format' },
  'city-kit-commercial': { slug: 'city-kit-commercial', dir: 'Models/GLB format' },
  'blaster-kit': { slug: 'blaster-kit', dir: 'Models/GLB format' },
};

// axis: which bbox extent `size` refers to. ground: put min-Y at 0 (props and
// cars both stand on the street). centerXZ: put the footprint's centre on the
// origin — everything the city places is positioned by its base centre.
//
// rotY: degrees about Y, applied BEFORE the fit, because the whole pack is
// authored facing -Z (the Blender/glTF convention) and this game's forward is
// +Z: player yaw is used as (sin, cos), world/traffic.js builds cars nose-first
// along +z, and engine/citylights.js hangs a lamp's pool of light off +z. One
// number here beats a correction rotation at every use site.
//
// offX/offZ: post-scale metres, applied last, to move the part of the model the
// CITY places by — a signal's pole rather than the centre of its mast arm — onto
// the origin. Measure with `node tools/geom-probe.mjs <glb>`.
const JOBS = [
  // --- street furniture (replaces the procedural stand-ins in world/procprops.js)
  // the lamp's gooseneck reaches over the carriageway: rotated so it reaches +z,
  // which is where engine/citylights.js puts the pool of light
  ['prop_streetlamp', 'city-kit-roads', 'light-curved.glb', { axis: 'y', size: 5.6, ground: 1, centerXZ: 0, rotY: 180, tex: 256 }],
  // signal head faces -x on the raw model; +90 turns the lenses to face +z, and
  // the offset puts the POLE on the origin rather than the middle of the bracket
  ['prop_trafficlight', 'city-kit-roads', 'traffic-light.glb', { axis: 'y', size: 4.6, ground: 1, centerXZ: 1, rotY: 90, offZ: 0.125, tex: 256 }],
  ['prop_sign', 'city-kit-roads', 'road-sign-street.glb', { axis: 'y', size: 2.6, ground: 1, centerXZ: 1, tex: 256 }],
  ['prop_tree', 'city-kit-suburban', 'tree-large.glb', { axis: 'y', size: 6.0, ground: 1, centerXZ: 1, tex: 256 }],
  ['prop_kiosk', 'city-kit-commercial', 'detail-parasol-a.glb', { axis: 'y', size: 2.6, ground: 1, centerXZ: 1, tex: 256 }],
  // --- traffic. Sized by LENGTH but chosen by height: this pack's cars are
  // ~0.5 as tall as they are long (a real one is ~0.32), so a 4.4m Kenney sedan
  // stands 2.24m — taller than the man beside it. 3.35m puts the roof just under
  // his eyeline, which is the proportion the eye actually checks.
  ['car_sedan', 'car-kit', 'sedan.glb', { axis: 'z', size: 3.35, ground: 1, centerXZ: 1, rotY: 180, tex: 256 }],
  ['car_taxi', 'car-kit', 'taxi.glb', { axis: 'z', size: 3.35, ground: 1, centerXZ: 1, rotY: 180, tex: 256 }],
  ['car_van', 'car-kit', 'van.glb', { axis: 'z', size: 3.75, ground: 1, centerXZ: 1, rotY: 180, tex: 256 }],
  ['car_police', 'car-kit', 'police.glb', { axis: 'z', size: 3.45, ground: 1, centerXZ: 1, rotY: 180, tex: 256 }],
  ['car_wreck', 'car-kit', 'sedan-sports.glb', { axis: 'z', size: 3.35, ground: 1, centerXZ: 1, rotY: 180, tex: 256 }],
  // --- weapons. Origin stays where Kenney put it (inside the grip) so the hand
  // bone has something meaningful to hold; player/weapons.js measures the muzzle
  // off the mesh rather than assuming one.
  ['gun_pistol', 'blaster-kit', 'blaster-b.glb', { axis: 'z', size: 0.32, ground: 0, centerXZ: 0, rotY: 180, tex: 256 }],
  ['gun_smg', 'blaster-kit', 'blaster-j.glb', { axis: 'z', size: 0.46, ground: 0, centerXZ: 0, rotY: 180, tex: 256 }],
  ['gun_rifle', 'blaster-kit', 'blaster-d.glb', { axis: 'z', size: 0.72, ground: 0, centerXZ: 0, rotY: 180, tex: 256 }],
  ['gun_shotgun', 'blaster-kit', 'blaster-o.glb', { axis: 'z', size: 0.54, ground: 0, centerXZ: 0, rotY: 180, tex: 256 }],
  ['gun_sniper', 'blaster-kit', 'blaster-e.glb', { axis: 'z', size: 1.05, ground: 0, centerXZ: 0, rotY: 180, tex: 256 }],
  ['gun_cannon', 'blaster-kit', 'blaster-p.glb', { axis: 'z', size: 0.80, ground: 0, centerXZ: 0, rotY: 180, tex: 256 }],
];

function sh(cmd, args) { return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 }); }

function packZip(name) {
  const { slug } = PACKS[name];
  const zip = pjoin(CACHE, `${slug}.zip`);
  if (existsSync(zip) && statSync(zip).size > 1000) return zip;
  const page = sh('curl', ['-sSL', '--max-time', '60', `https://kenney.nl/assets/${slug}`]);
  const m = page.match(/https:\/\/kenney\.nl\/media\/pages\/assets\/[^"']+\.zip/);
  if (!m) throw new Error(`no zip url on kenney.nl/assets/${slug}`);
  console.log(`  fetching ${m[0]}`);
  sh('curl', ['-sSL', '--max-time', '600', '-o', zip, m[0]]);
  return zip;
}

function extract(name) {
  const dir = pjoin(CACHE, name);
  if (existsSync(dir)) return dir;
  const zip = packZip(name);
  mkdirSync(dir, { recursive: true });
  sh('unzip', ['-oq', zip, '-d', dir]);
  return dir;
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;

const wanted = process.argv.slice(2);
const report = [];

for (const [out, pack, member, opt] of JOBS) {
  if (wanted.length && !wanted.includes(out)) continue;
  const dir = extract(pack);
  const src = pjoin(dir, PACKS[pack].dir, member);
  if (!existsSync(src)) { console.error(`MISSING ${src}`); process.exitCode = 1; continue; }

  const doc = await io.read(src);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];

  // Collapse the node hierarchy into world space, then merge every primitive
  // into one. flatten() first is what makes join() legal: Kenney's wheels and
  // magazines are child nodes with their own transforms, and joining before
  // baking those would stack four wheels on the origin.
  await doc.transform(dedup(), flatten(), join({ keepNamed: false }), weld(), prune());

  // Face the pack's -Z forward down this game's +Z. Baked into the node tree
  // before the fit so every bound below is measured on the final orientation.
  if (opt.rotY) {
    const a = (opt.rotY * Math.PI) / 360;              // half-angle, Y axis
    const spin = doc.createNode('fit-rot').setRotation([0, Math.sin(a), 0, Math.cos(a)]);
    for (const child of scene.listChildren()) { scene.removeChild(child); spin.addChild(child); }
    scene.addChild(spin);
  }

  // Scale + ground. Done with wrapper nodes rather than by rewriting vertex data
  // so it survives quantization exactly (the same trick optimize-glb.mjs uses).
  const b = getBounds(scene);
  const ext = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const ai = opt.axis === 'x' ? 0 : opt.axis === 'z' ? 2 : 1;
  const s = opt.size / Math.max(ext[ai], 1e-6);
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const shift = doc.createNode('fit-shift').setTranslation([
    opt.centerXZ ? -cx : 0,
    opt.ground ? -b.min[1] : 0,
    opt.centerXZ ? -cz : 0,
  ]);
  const wrap = doc.createNode('fit-scale').setScale([s, s, s]);
  for (const child of scene.listChildren()) { scene.removeChild(child); shift.addChild(child); }
  wrap.addChild(shift);
  if (opt.offX || opt.offZ) {
    const anchor = doc.createNode('fit-anchor').setTranslation([opt.offX || 0, 0, opt.offZ || 0]);
    anchor.addChild(wrap);
    scene.addChild(anchor);
  } else {
    scene.addChild(wrap);
  }

  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [opt.tex, opt.tex] }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
  );

  const outAbs = pjoin(root, 'assets/models', `${out}.glb`);
  mkdirSync(dirname(outAbs), { recursive: true });
  await io.write(outAbs, doc);

  const nb = getBounds(doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]);
  let tris = 0, prims = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      prims++;
      const idx = p.getIndices();
      tris += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
    }
  }
  const kb = statSync(outAbs).size / 1024;
  const size = nb.max.map((v, i) => +(v - nb.min[i]).toFixed(3));
  report.push({ out, pack, member, size, min: nb.min.map((v) => +v.toFixed(3)), tris, prims, kb: +kb.toFixed(0) });
  console.log(`${pack}/${member} -> assets/models/${out}.glb  ${size.join('x')}  ${tris}tri  ${kb.toFixed(0)}KB  prims=${prims}`);
}

// Provenance. CC0 asks for nothing, but a repo that ships other people's work
// should say whose it is and where it came from — and the samosa is CC BY, which
// asks for exactly this and is NOT imported by this tool, so it has to be
// carried here by hand or a regeneration would quietly drop the one attribution
// in the repo that is a licence condition rather than a courtesy.
if (!wanted.length) {
  const rows = JOBS.map(([out, pack, member]) => `| \`assets/models/${out}.glb\` | ${pack} | \`${member}\` |`).join('\n');
  writeFileSync(pjoin(root, 'assets/CREDITS.md'), `# Third-party assets

Every model in the table below is by **[Kenney](https://kenney.nl)** and released
under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — public
domain, free for any use, credit appreciated but not required. One asset in this
repo is not: see the section after the table.

Imported by \`tools/import-models.mjs\`, which downloads the original pack from
kenney.nl, merges it to a single mesh, rescales it to metric game size, grounds
its origin and re-encodes the palette atlas as WebP. Re-run it to reproduce every
file in the table.

| Game asset | Kenney pack | Source model |
|---|---|---|
${rows}

## Not from Kenney, and not CC0

\`assets/models/landmark_samosa.glb\` is a single mesh lifted from
**["Samosa, Cake Snacks Plate"](https://sketchfab.com/3d-models/samosa-cake-snacks-plate-57baf38756304e7b979372500dac0e91)**
by **ronchoqa**, licensed
**[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)** — which, unlike
everything above, *requires* that attribution. The mesh was extracted from the
multi-object original, stood upright and re-optimized by
\`tools/optimize-glb.mjs\`; nothing else from the source model ships. It is not
produced by this tool and re-running this tool does not touch it.

## Original work

The characters, monsters, animation clips, hydrant, bench, dumpster, skybox,
splash and title art are original to this project (Higgsfield SAM 3 + Meshy) and
are not covered by any of the above.
`);
  writeFileSync(pjoin(CACHE, 'last-report.json'), JSON.stringify(report, null, 2));
  console.log('assets/CREDITS.md written');
}
