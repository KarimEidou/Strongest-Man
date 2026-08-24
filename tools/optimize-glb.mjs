// Asset pipeline: raw Higgsfield/Meshy GLBs -> optimized game GLBs.
// - static props/cars: rescale to real-world size, ground origin at min-Y, center XZ
// - rigged characters: keep skeleton+clip untouched (already metric via rigging)
// - clips-only files: drop mesh/skin geometry, keep animations (tiny clip bank)
// - all: weld, prune, resample anims, quantize, meshopt compress, textures -> WebP
// Run from tools/: node optimize-glb.mjs <rawDir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, prune, dedup, resample, quantize, textureCompress, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = process.argv[2];
if (!RAW) { console.error('usage: node optimize-glb.mjs <rawDir>'); process.exit(1); }

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

// target height (m) for static assets; characters are metric already.
const JOBS = [
  // [rawName, outPath, {height, texSize, dropMesh}]
  ['rig_player_idle.glb', 'assets/models/player.glb', { texSize: 1024 }],
  ['rig_npca_walk.glb', 'assets/models/npc_a.glb', { texSize: 1024 }],
  ['rig_npcb_quick.glb', 'assets/models/npc_b.glb', { texSize: 1024 }],
  ['rig_monstera_walk.glb', 'assets/models/monster_a.glb', { texSize: 1024 }],
  ['rig_monsterb_orc.glb', 'assets/models/monster_b.glb', { texSize: 1024 }],
  ['rig_player_run.glb', 'assets/anim/clip_run.glb', { dropMesh: true }],
  ['rig_player_punch.glb', 'assets/anim/clip_punch.glb', { dropMesh: true }],
  ['rig_player_die.glb', 'assets/anim/clip_die.glb', { dropMesh: true }],
  ['car_sedan.glb', 'assets/models/car_sedan.glb', { height: 1.45, texSize: 512 }],
  ['car_taxi.glb', 'assets/models/car_taxi.glb', { height: 1.5, texSize: 512 }],
  ['car_van.glb', 'assets/models/car_van.glb', { height: 2.2, texSize: 512 }],
  ['prop_hydrant.glb', 'assets/models/prop_hydrant.glb', { height: 0.85, texSize: 256 }],
  ['prop_bench.glb', 'assets/models/prop_bench.glb', { height: 0.9, texSize: 256 }],
  ['prop_streetlamp.glb', 'assets/models/prop_streetlamp.glb', { height: 5.6, texSize: 256 }],
  ['prop_trafficlight.glb', 'assets/models/prop_trafficlight.glb', { height: 4.6, texSize: 256 }],
  ['prop_sign.glb', 'assets/models/prop_sign.glb', { height: 2.6, texSize: 256 }],
  ['prop_dumpster.glb', 'assets/models/prop_dumpster.glb', { height: 1.35, texSize: 256 }],
  ['prop_kiosk.glb', 'assets/models/prop_kiosk.glb', { height: 2.6, texSize: 512 }],
  ['prop_tree.glb', 'assets/models/prop_tree.glb', { height: 6.0, texSize: 256 }],
];

for (const [raw, out, opt] of JOBS) {
  let doc;
  try { doc = await io.read(join(RAW, raw)); }
  catch { console.log(`SKIP ${raw} (missing)`); continue; }
  const rootNode = doc.getRoot();

  if (opt.dropMesh) {
    // Keep node hierarchy (bones are nodes, animations target them); remove geometry.
    for (const mesh of rootNode.listMeshes()) mesh.dispose();
    for (const skin of rootNode.listSkins()) skin.dispose();
    for (const tex of rootNode.listTextures()) tex.dispose();
    for (const mat of rootNode.listMaterials()) mat.dispose();
  }

  if (opt.height) {
    // Uniform scale so bounds height == target; ground at y=0, center in XZ.
    const scene = rootNode.getDefaultScene() ?? rootNode.listScenes()[0];
    const { min, max } = getBounds(scene);
    const h = max[1] - min[1];
    const s = opt.height / h;
    const wrap = doc.createNode('groundwrap').setScale([s, s, s]);
    const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
    for (const child of scene.listChildren()) { scene.removeChild(child); wrap.addChild(child); }
    // translate children so the model sits centered with feet at y=0 (pre-scale units)
    const shift = doc.createNode('groundshift').setTranslation([-cx, -min[1], -cz]);
    for (const child of wrap.listChildren()) { wrap.removeChild(child); shift.addChild(child); }
    wrap.addChild(shift);
    scene.addChild(wrap);
  }

  await doc.transform(dedup(), weld(), resample(), prune());
  if (!opt.dropMesh) {
    await doc.transform(
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [opt.texSize, opt.texSize] }),
      quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
    );
  }
  const outAbs = join(root, out);
  mkdirSync(dirname(outAbs), { recursive: true });
  await io.write(outAbs, doc);
  const kb = (await import('fs')).statSync(outAbs).size / 1024;
  console.log(`${raw} -> ${out} (${kb.toFixed(0)} KB)`);
}
console.log('done');
