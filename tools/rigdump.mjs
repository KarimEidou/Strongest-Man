import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();

// quaternion (x,y,z,w) helpers
const qmul = (a, b) => [
  a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1],
  a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0],
  a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3],
  a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2],
];
const qrot = (q, v) => {
  const [x,y,z,w] = q, [vx,vy,vz] = v;
  const ix = w*vx + y*vz - z*vy, iy = w*vy + z*vx - x*vz, iz = w*vz + x*vy - y*vx, iw = -x*vx - y*vy - z*vz;
  return [ix*w + iw*-x + iy*-z - iz*-y, iy*w + iw*-y + iz*-x - ix*-z, iz*w + iw*-z + ix*-y - iy*-x];
};
const vadd = (a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const f = (v)=>v.map(n=>n.toFixed(3)).join(',');

const nodes = root.listNodes();
const parentOf = new Map();
for (const n of nodes) for (const c of n.listChildren()) parentOf.set(c, n);

const world = new Map(); // node -> {q, t}
function acc(n) {
  if (world.has(n)) return world.get(n);
  const p = parentOf.get(n);
  const lq = n.getRotation(), lt = n.getTranslation();
  let w;
  if (!p) w = { q: [...lq], t: [...lt] };
  else { const pw = acc(p); w = { q: qmul(pw.q, lq), t: vadd(pw.t, qrot(pw.q, lt)) }; }
  world.set(n, w); return w;
}

const WANT = process.argv[3] ? process.argv[3].split(',') : ['Hips','Spine','Spine01','Spine02','neck','Head','LeftShoulder','LeftArm','LeftForeArm','LeftHand','RightShoulder','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
console.log('bone            worldPos                 localAxis+X -> world     +Y -> world           +Z -> world');
for (const n of nodes) {
  const nm = n.getName();
  if (!WANT.includes(nm)) continue;
  const w = acc(n);
  console.log(nm.padEnd(15), f(w.t).padEnd(24),
    f(qrot(w.q,[1,0,0])).padEnd(22), f(qrot(w.q,[0,1,0])).padEnd(22), f(qrot(w.q,[0,0,1])));
}
