// Compares Meshy-rigged GLBs: bone names and order, AND bind rotations.
//
// It used to compare names and order only, and printed MATCH on that basis —
// which is how the claim that these rigs "share an IDENTICAL skeleton" survived
// in js/anim/retarget.js's header while being false. They share bone NAMES.
// Their bind poses are as much as 131 degrees apart, and a clip carries absolute
// local rotations, so playing one rig's clip on another rotates that bone's
// skinned geometry by exactly that angle.
//
// Rotations are compared in each rig's own ROOT frame, composed down the joint
// hierarchy — not in world space, which would fold in whatever rotation each
// file happens to carry on its Armature node.
//
// A name/order mismatch still FAILS the run: it would break track resolution
// outright. A bind mismatch is REPORTED, with the worst bones named, and does
// not fail: it is the honest state of this asset set, it is compensated for
// downstream, and ASSUMPTIONS.md records why.
//
// Run: node check-rig.mjs <a.glb> <b.glb> ...
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// quaternion helpers, xyzw, same convention as glTF
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
// Angle between two rotations, in degrees. |dot| because q and -q are the same
// rotation and a sign flip between two files would otherwise read as 360-x.
const qangle = (a, b) => {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return +(2 * Math.acos(Math.min(1, d)) * 180 / Math.PI).toFixed(1);
};

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
  // Bind rotation per bone, composed from each joint up to the skeleton root, so
  // the numbers are comparable across files whatever their Armature does.
  const bind = new Map();
  if (skins.length) {
    const joints = skins[0].listJoints();
    const inSkin = new Set(joints);
    const worldOf = (node) => {
      let q = [0, 0, 0, 1];
      for (let n = node; n && inSkin.has(n); n = n.getParentNode?.()) q = qmul(n.getRotation(), q);
      return q;
    };
    for (const j of joints) {
      bones.push(j.getName());
      bind.set(j.getName(), worldOf(j));
    }
  }
  const meshes = root.listMeshes().length;
  const prims = root.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0);
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices();
    tris += idx ? idx.getCount() / 3 : (p.getAttribute('POSITION')?.getCount() ?? 0) / 3;
  }
  return { skins: skins.length, bones, bind, anims, meshes, prims, tris: Math.round(tris) };
}

// Anything under this is export noise rather than a different rig.
const BIND_TOL = 2;

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
  if (!ref) { ref = d; refName = name; continue; }
  const same = d.bones.length === ref.bones.length && d.bones.every((b, i) => b === ref.bones[i]);
  if (same) console.log(`  bones MATCH vs ${refName}`);
  else {
    fail = true;
    console.log(`  bones MISMATCH vs ${refName}!`);
    console.log(`    ref-only: ${ref.bones.filter((b) => !d.bones.includes(b)).join(',') || '(none)'}`);
    console.log(`    this-only: ${d.bones.filter((b) => !ref.bones.includes(b)).join(',') || '(none)'}`);
  }
  // Bind rotations, reported whether or not the names line up.
  const devs = [];
  for (const [bn, q] of d.bind) {
    const r = ref.bind.get(bn);
    if (r) devs.push([bn, qangle(q, r)]);
  }
  devs.sort((a, b) => b[1] - a[1]);
  const worst = devs[0]?.[1] ?? 0;
  if (worst < BIND_TOL) {
    console.log(`  bind pose MATCHES ${refName} (worst ${worst.toFixed(1)} deg)`);
  } else {
    console.log(`  bind pose DIFFERS from ${refName} — worst ${worst.toFixed(1)} deg:`);
    for (const [bn, deg] of devs.slice(0, 6)) console.log(`    ${bn.padEnd(16)} ${deg.toFixed(1)} deg`);
    console.log('    A clip carries ABSOLUTE local rotations, so playing one authored on');
    console.log(`    ${refName} here rotates each of those bones by that angle. Not fixed at`);
    console.log('    load time — see the header of js/anim/retarget.js and ASSUMPTIONS.md.');
  }
}
process.exit(fail ? 1 : 0);
