// Asset pipeline: raw Higgsfield/Meshy GLBs -> optimized game GLBs.
// - static props/cars: rescale to real-world size, ground origin at min-Y, center XZ
// - rigged characters: keep skeleton+clip untouched (already metric via rigging)
// - clips-only files: drop mesh/skin geometry, keep animations (tiny clip bank)
// - all: weld, prune, resample anims, quantize, meshopt compress, textures -> WebP
// Run from tools/: node optimize-glb.mjs <rawDir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, prune, dedup, resample, quantize, textureCompress, getBounds, simplify } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
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
  // [rawName, outPath, {height, texSize, dropMesh, ratio}]
  // (models that failed visual QA are replaced procedurally in-game and are
  //  no longer exported: cars, streetlamp, trafficlight, sign, kiosk, tree)
  ['rig_player_idle.glb', 'assets/models/player.glb', { texSize: 1024 }],
  ['rig_npca_walk.glb', 'assets/models/npc_a.glb', { texSize: 1024, ratio: 0.55 }],
  ['rig_npcb_quick.glb', 'assets/models/npc_b.glb', { texSize: 1024, ratio: 0.55 }],
  ['rig_monstera_walk.glb', 'assets/models/monster_a.glb', { texSize: 1024, ratio: 0.7 }],
  ['rig_monsterb_orc.glb', 'assets/models/monster_b.glb', { texSize: 1024 }],
  ['rig_player_run.glb', 'assets/anim/clip_run.glb', { dropMesh: true }],
  ['rig_player_punch.glb', 'assets/anim/clip_punch.glb', { dropMesh: true }],
  ['rig_player_die.glb', 'assets/anim/clip_die.glb', { dropMesh: true }],
  ['prop_hydrant.glb', 'assets/models/prop_hydrant.glb', { height: 0.85, texSize: 256, ratio: 0.22 }],
  ['prop_bench.glb', 'assets/models/prop_bench.glb', { height: 0.9, texSize: 256, ratio: 0.22 }],
  ['prop_dumpster.glb', 'assets/models/prop_dumpster.glb', { height: 1.35, texSize: 256, ratio: 0.22 }],
  // Landmark shell: one mesh lifted out of a multi-mesh CC-BY plate of snacks, stood
  // upright and normalised to 1m tall — world/samosa.js rescales it to the lot at runtime.
  ['landmark_samosa.glb', 'assets/models/landmark_samosa.glb',
    { height: 1, texSize: 512, keepMaterial: 'Samosa.001', rotate: [0, 90, 90] }],
];

// Euler degrees (three.js XYZ order) -> quaternion, for `rotate`.
function eulerToQuat([xd, yd, zd]) {
  const h = Math.PI / 360;
  const c1 = Math.cos(xd * h), s1 = Math.sin(xd * h);
  const c2 = Math.cos(yd * h), s2 = Math.sin(yd * h);
  const c3 = Math.cos(zd * h), s3 = Math.sin(zd * h);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

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

  if (opt.keepMaterial) {
    // Lift a single material's geometry out of a multi-mesh source; prune() then drops
    // the orphaned materials, textures and nodes.
    for (const mesh of rootNode.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMaterial()?.getName() !== opt.keepMaterial) { mesh.removePrimitive(prim); prim.dispose(); }
      }
      if (!mesh.listPrimitives().length) mesh.dispose();
    }
    // The game renders Lambert with baseColor only (engine/assets.js), so every other
    // texture is dead weight — drop them and the vertex attributes that fed them.
    for (const mat of rootNode.listMaterials()) {
      mat.setNormalTexture(null);
      mat.setMetallicRoughnessTexture(null);
      mat.setOcclusionTexture(null);
      mat.setEmissiveTexture(null);
    }
    const KEEP = new Set(['POSITION', 'NORMAL', 'TEXCOORD_0']);
    for (const mesh of rootNode.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        for (const sem of prim.listSemantics()) if (!KEEP.has(sem)) prim.setAttribute(sem, null);
      }
    }
  }

  if (opt.rotate) {
    // Stand the model up before bounds are measured, so `height` grounds the rotated pose.
    const scene = rootNode.getDefaultScene() ?? rootNode.listScenes()[0];
    const spin = doc.createNode('rotate').setRotation(eulerToQuat(opt.rotate));
    for (const child of scene.listChildren()) { scene.removeChild(child); spin.addChild(child); }
    scene.addChild(spin);
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
  if (opt.ratio) {
    await MeshoptSimplifier.ready;
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: opt.ratio, error: 0.001 }));
  }
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
