// Where a merged game GLB's mass actually sits, in bands along one axis, in the
// file's own final coordinates. Code that has to hang something off a model — a
// lamp's pool of light, a signal's live lenses, a muzzle — gets real numbers
// from here instead of a guess.
//   node tools/geom-probe.mjs <glb...>          bands up Y
//   AXIS=z node tools/geom-probe.mjs <glb...>   bands along Z (guns, cars)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
await MeshoptDecoder.ready;

// column-major 4x4, same layout as glTF
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let v = 0;
    for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = v;
  }
  return o;
}
function trs(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
const apply = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

const axis = (process.env.AXIS || 'y').toLowerCase();
const AI = axis === 'x' ? 0 : axis === 'z' ? 2 : 1;
const OTHER = [0, 1, 2].filter((i) => i !== AI);
const LBL = 'xyz';

for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const pts = [];
  const walk = (node, parent) => {
    const m = mul(parent, trs(node.getTranslation(), node.getRotation(), node.getScale()));
    const mesh = node.getMesh?.();
    if (mesh) for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const a = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, a); pts.push(apply(m, a)); }
    }
    for (const c of node.listChildren()) walk(c, m);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const n of scene.listChildren()) walk(n, I);
  if (!pts.length) { console.log('###', f, 'no geometry'); continue; }

  const v = pts.map((p) => p[AI]);
  const lo0 = Math.min(...v), hi0 = Math.max(...v);
  console.log(`### ${f.split('/').pop()}  verts ${pts.length}  ${LBL[AI]} ${lo0.toFixed(3)}..${hi0.toFixed(3)}`);
  for (let i = 0; i < 8; i++) {
    const lo = lo0 + (hi0 - lo0) * i / 8, hi = lo0 + (hi0 - lo0) * (i + 1) / 8;
    const band = pts.filter((p) => p[AI] >= lo && p[AI] <= hi);
    if (!band.length) { console.log(`  ${i} ${LBL[AI]}[${lo.toFixed(2)},${hi.toFixed(2)}] empty`); continue; }
    const parts = OTHER.map((k) => {
      const a = band.map((p) => p[k]);
      return `${LBL[k]}[${Math.min(...a).toFixed(2)},${Math.max(...a).toFixed(2)}]`;
    });
    console.log(`  ${i} ${LBL[AI]}[${lo.toFixed(2)},${hi.toFixed(2)}] n=${String(band.length).padStart(4)} ${parts.join(' ')}`);
  }
}
