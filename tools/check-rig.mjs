// Verifies that every Meshy-rigged GLB shares the same skeleton (bone names and
// hierarchy) so animation clips baked on one rig can be retargeted onto all of
// them at load time. Run: node check-rig.mjs <a.glb> <b.glb> ...
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function describe(doc) {
  const root = doc.getRoot();
  const skins = root.listSkins();
  const anims = root.listAnimations().map((a) => {
    const secs = Math.max(0, ...a.listSamplers().map((s) => {
      const inp = s.getInput();
      return inp ? inp.getMax([0])[0] : 0;
    }));
    return `${a.getName() || '(unnamed)'} ${secs.toFixed(2)}s`;
  });
  const bones = [];
  if (skins.length) {
    for (const j of skins[0].listJoints()) bones.push(j.getName());
  }
  const meshes = root.listMeshes().length;
  const prims = root.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0);
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices();
    tris += idx ? idx.getCount() / 3 : (p.getAttribute('POSITION')?.getCount() ?? 0) / 3;
  }
  return { skins: skins.length, bones, anims, meshes, prims, tris: Math.round(tris) };
}

let ref = null;
let refName = '';
let fail = false;
for (const path of process.argv.slice(2)) {
  const doc = await io.read(path);
  const d = describe(doc);
  const name = path.split('/').pop();
  console.log(`\n${name}: skins=${d.skins} meshes=${d.meshes} prims=${d.prims} tris=${d.tris}`);
  console.log(`  anims: ${d.anims.join(', ') || 'none'}`);
  console.log(`  bones(${d.bones.length}): ${d.bones.slice(0, 8).join(',')}${d.bones.length > 8 ? ',…' : ''}`);
  if (!d.bones.length) { console.log('  (static mesh)'); continue; }
  if (!ref) { ref = d.bones; refName = name; continue; }
  const same = d.bones.length === ref.length && d.bones.every((b, i) => b === ref[i]);
  if (same) console.log(`  MATCH vs ${refName}`);
  else {
    fail = true;
    console.log(`  MISMATCH vs ${refName}!`);
    console.log(`    ref-only: ${ref.filter((b) => !d.bones.includes(b)).join(',') || '(none)'}`);
    console.log(`    this-only: ${d.bones.filter((b) => !ref.includes(b)).join(',') || '(none)'}`);
  }
}
process.exit(fail ? 1 : 0);
