// Procedural palette props, built to match the approved prop-redesign sheets:
// clean low-poly primitives in the icon palette, with facet shading. All 3D,
// all instanced, all destruction-ready (lamps/signals tip over, cars crush,
// signal lenses are a separate live-colored layer).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tagGeometry, faceShade, SURF, setSurface } from '../engine/materials.js';
import { PAL } from '../core/palette.js';

const box = (w, h, d, c, shade = 1, surf = SURF.METAL) => tagGeometry(new THREE.BoxGeometry(w, h, d).toNonIndexed(), c, 0, shade, surf);
const cyl = (rt, rb, h, seg, c, shade = 1, surf = SURF.METAL) => tagGeometry(new THREE.CylinderGeometry(rt, rb, h, seg).toNonIndexed(), c, 0, shade, surf);

// Open-ended cylinder. Every post in this file is a stack of sections whose ends
// are buried in the collar above and the plinth below, and a capped six-sided
// cylinder spends HALF its triangles on those two invisible discs. Same
// silhouette for half the cost, which is what pays for the goosenecks, the
// wheel arches and the extra canopy lobes.
const tube = (rt, rb, h, seg, c, shade = 1, surf = SURF.METAL) =>
  tagGeometry(new THREE.CylinderGeometry(rt, rb, h, seg, 1, true).toNonIndexed(), c, 0, shade, surf);

// merge helper: uv layouts differ between primitives and custom prisms — the
// shared material samples no textures, so drop uv everywhere before merging
function mergeParts(parts) {
  for (const p of parts) p.deleteAttribute('uv');
  return mergeGeometries(parts);
}

// Eight-corner hull. prism() below tapers symmetrically about its axis, which is
// all a post or a signboard ever needs; a car body narrows in PLAN, drops its
// nose and rakes its screen at the same time, so this takes both rings outright.
// Winding matches prism's (−x−z, +x−z, +x+z, −x+z) so the two can be mixed
// without a normal flipping anywhere.
function hull(b, t, c, opts = {}) {
  const tri = [];
  const push = (...pts) => { for (const p of pts) tri.push(p[0], p[1], p[2]); };
  push(t[0], t[3], t[2]); push(t[0], t[2], t[1]);       // top (+y)
  push(b[0], b[1], b[2]); push(b[0], b[2], b[3]);       // bottom (−y)
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    push(b[i], t[i], t[j]); push(b[i], t[j], b[j]);     // sides
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
  g.computeVertexNormals();
  return tagGeometry(g, c, 0, opts.shade ?? 1, opts.surf ?? SURF.METAL);
}

// One ring of a hull: the rear (−z) and front (+z) edges each get their own
// half-width, z and height. A plan taper, a dropped bonnet and a raked screen
// therefore cost one call, not three.
const ring = (wR, wF, zR, zF, yR, yF = yR) => [
  [-wR / 2, yR, zR], [wR / 2, yR, zR], [wF / 2, yF, zF], [-wF / 2, yF, zF],
];

// tapered box: bottom rect (wB×dB) to top rect (wT×dT) over height h, top
// optionally shifted along z (raked windshields, swept cabins)
function prism(wB, dB, wT, dT, h, c, opts = {}) {
  const zo = opts.zOff || 0;
  return hull(ring(wB, wB, -dB / 2, dB / 2, 0), ring(wT, wT, -dT / 2 + zo, dT / 2 + zo, h), c, opts);
}

// GLAZING. A pane is one quad laid on the panel it belongs to and floated a
// couple of centimetres proud of it — never a box. There is always opaque
// bodywork directly behind glass on these shapes, so the five hidden faces of a
// solid slab are pure cost. What makes it read as glass is the surface id: the
// shader gives id 6 a pane hash, a hot specular lobe and the sky fresnel, so a
// windscreen catches the sun while the paint two centimetres away stays matte.
function pane(w, h, c) {
  return tagGeometry(new THREE.PlaneGeometry(w, h).toNonIndexed(), c, 0, 1.15, SURF.GLASS);
}

// A pane on a RAKED panel, given the panel's bottom and top edges in the z/y
// plane. `s` is +1 for a panel facing the nose, −1 for one facing the tail; the
// quad is rotated onto the panel's slope and pushed out along its own normal,
// so a windscreen and a backlight come from the same three numbers.
function rakedPane(w, zB, yB, zT, yT, s, c, out = 0.022) {
  const dz = zT - zB, dy = yT - yB;
  const g = new THREE.PlaneGeometry(w, Math.hypot(dz, dy)).toNonIndexed();
  if (s < 0) g.rotateY(Math.PI);          // face the tail, then take the same rake
  const rx = Math.atan2(dz, dy);
  g.rotateX(rx);
  g.translate(0, (yB + yT) / 2 - s * Math.sin(rx) * out, (zB + zT) / 2 + s * Math.cos(rx) * out);
  return tagGeometry(g, c, 0, 1.15, SURF.GLASS);
}

// A wheel arch: the upper half of an open CONE lying across the hub, small end
// inboard. Ten triangles for the one silhouette line that separates a car from a
// shoebox on wheels — the flat slab sides had nothing to say about where the
// wheels were. A plain half-TUBE was the obvious build and it is wrong: every
// face of a tube points radially, so side-on (the angle a car in traffic is
// nearly always seen from) all that survives is a hairline rim. Flaring it means
// the faces carry an outboard component too, and the arch reads from the side,
// from the front and from three-quarters. `sx` puts the wide end outboard on
// whichever flank it is going on.
function archGeo(rIn, rOut, thick, c, sx) {
  const g = new THREE.CylinderGeometry(sx > 0 ? rIn : rOut, sx > 0 ? rOut : rIn, thick, 5, 1, true, 0, Math.PI).toNonIndexed();
  g.rotateZ(Math.PI / 2);                 // cone axis −x…+x, arc over +y
  return tagGeometry(g, c, 0, 1);
}

// ---------------------------------------------------------------------------
// STREETLAMP — pad, octagonal plinth, twice-tapered pole, gooseneck and a cobra
// luminaire with a lens plate under its rim (5.6 m). The head sits at
// z 1.10 / y 5.4: engine/citylights.js hangs the light pool off exactly that
// point (reach 1.1, height 5.4) and reads it from nowhere else.
export function streetlampGeo() {
  const parts = [];
  const POST = 0x1c2440, DARK = 0x141a30;
  // Footing in three steps, not two stacked drums. This is the part a player
  // stands next to, and the old base met the pavement with one hard 90° edge.
  parts.push(box(0.54, 0.08, 0.54, DARK).translate(0, 0.04, 0));
  parts.push(cyl(0.225, 0.27, 0.27, 8, POST).translate(0, 0.215, 0));
  parts.push(tube(0.115, 0.225, 0.26, 8, DARK).translate(0, 0.48, 0));
  // pole: two tapered sections so the taper is actually visible, joined by the
  // one collar that survived — the mid-pole collars were reading as dirt
  parts.push(tube(0.088, 0.115, 1.5, 6, POST).translate(0, 1.36, 0));
  parts.push(cyl(0.105, 0.112, 0.09, 6, DARK).translate(0, 2.15, 0));
  parts.push(tube(0.062, 0.088, 2.8, 6, POST).translate(0, 3.6, 0));
  // gooseneck: quarter torus from pole top (y 4.92) curving forward (+z)
  const R = 0.58;
  const neck = new THREE.TorusGeometry(R, 0.062, 5, 7, Math.PI / 2).toNonIndexed();
  neck.rotateY(-Math.PI / 2);          // arc spans +z → +y
  neck.rotateY(Math.PI);               // arc spans −z → +y
  neck.translate(0, 4.92, R);          // start joins the pole, end runs level at y 5.5
  parts.push(tagGeometry(neck, POST, 0, 1));
  // arm: a prism stood on its side, so it thins as it reaches out to the head
  const arm = prism(0.108, 0.118, 0.078, 0.088, 0.58, POST);
  arm.rotateX(Math.PI / 2);            // height axis becomes the run along +z
  arm.translate(0, 5.5, R);
  parts.push(arm);
  // head: a cobra housing tapering up to its spine, a proud door rim, and the
  // lens plate hanging below the rim where the light actually leaves
  const hz = R + 0.52;
  parts.push(prism(0.44, 0.60, 0.32, 0.44, 0.2, 0x39456b).translate(0, 5.42, hz));
  parts.push(box(0.47, 0.035, 0.63, 0x2b3557).translate(0, 5.42, hz));
  parts.push(box(0.38, 0.055, 0.52, 0xffd9a0, 1.4, SURF.LAMP).translate(0, 5.375, hz));  // lights up after dark
  return faceShade(mergeParts(parts));
}

// ---------------------------------------------------------------------------
// TRAFFIC SIGNAL — banded footing, braced mast arm, hooded housing on a hi-vis
// backboard (4.6 m). The lens coordinates (y 4.08/3.80/3.52, z 1.395) are
// load-bearing: traffic.js places its live-colored lens instances there, so the
// face plate stays behind 1.395 and the visors arch clear of it.
export function trafficLightGeo() {
  const parts = [];
  const POST = 0x1c2440, DARK = 0x141a30;
  // cast pad + hazard-banded plinth
  parts.push(box(0.46, 0.07, 0.46, DARK).translate(0, 0.035, 0));
  parts.push(box(0.32, 0.13, 0.32, 0x0d1b3e).translate(0, 0.135, 0));
  parts.push(box(0.28, 0.11, 0.28, PAL.orange).translate(0, 0.255, 0));
  parts.push(box(0.26, 0.11, 0.26, 0x0d1b3e).translate(0, 0.365, 0));
  parts.push(box(0.24, 0.11, 0.24, PAL.orange).translate(0, 0.475, 0));
  parts.push(tube(0.075, 0.105, 3.6, 6, POST).translate(0, 2.33, 0));
  parts.push(cyl(0.088, 0.095, 0.08, 6, DARK).translate(0, 4.17, 0));       // mast cap
  // mast arm, thinning as it reaches over the road, plus its brace
  const arm = prism(0.1, 0.115, 0.078, 0.092, 1.3, POST);
  arm.rotateX(Math.PI / 2);
  arm.translate(0, 4.05, 0);
  parts.push(arm);
  const strut = box(0.055, 0.055, 1.35, POST);
  strut.rotateX(-0.62);
  strut.translate(0, 3.6, 0.52);
  parts.push(strut);
  // Backboard: the hi-vis surround a real signal head hangs on. Without it the
  // lenses read against whatever happens to be behind the junction — sky, at
  // the exact height a signal is hardest to pick out.
  parts.push(box(0.7, 1.36, 0.03, 0x0d1b3e).translate(0, 3.72, 1.02));
  parts.push(box(0.64, 1.3, 0.04, PAL.orange, 1.05).translate(0, 3.72, 1.05));
  // housing: back box + proud rim frame + face plate. The face sits at z 1.365
  // so the live lens quads (z 1.395) float just proud of it, never buried.
  parts.push(box(0.36, 1.0, 0.24, 0x0d1b3e).translate(0, 3.72, 1.2));
  parts.push(box(0.42, 1.06, 0.06, 0x1a2340).translate(0, 3.72, 1.33));
  parts.push(box(0.34, 0.96, 0.02, 0x131c38).translate(0, 3.72, 1.365));
  // Visors: open half-tubes arching over each lens and projecting 17cm past it.
  // Open-ended on purpose — a visor IS a hood with nothing at the front, and the
  // two caps a closed cylinder adds are half the cost of the part.
  for (let k = 0; k < 3; k++) {
    const hood = new THREE.CylinderGeometry(0.14, 0.14, 0.2, 6, 1, true, -Math.PI / 2, Math.PI).toNonIndexed();
    hood.rotateX(-Math.PI / 2);          // arc becomes the upper half of the x/y plane
    hood.translate(0, 4.08 - k * 0.28 + 0.015, 1.47);
    parts.push(tagGeometry(hood, DARK, 0, 1));
  }
  return faceShade(mergeParts(parts));
}

// separate tiny quad instanced per lens so intersections can switch colors
export function trafficLensGeo() {
  const g = new THREE.PlaneGeometry(0.17, 0.17).toNonIndexed();
  tagGeometry(g, 0xffffff, 0, 1.6, SURF.GLASS);
  return g; // positioned per instance at head front (z 1.395)
}

// ---------------------------------------------------------------------------
// STREET SIGN — footing pad and collar, tapered post, finial, a bracketed blade
// with a returned backboard, orange diamond on its own plate (2.6 m)
export function signGeo() {
  const parts = [];
  const POST = 0x39456b;
  // A blade this size needs to look BOLTED DOWN; it used to grow straight out
  // of the paving with no transition at all.
  parts.push(box(0.3, 0.06, 0.3, 0x141a30).translate(0, 0.03, 0));
  parts.push(cyl(0.085, 0.11, 0.17, 6, 0x1c2440).translate(0, 0.145, 0));
  parts.push(tube(0.042, 0.062, 2.3, 6, POST).translate(0, 1.38, 0));
  const finial = new THREE.IcosahedronGeometry(0.07, 0).toNonIndexed();
  parts.push(tagGeometry(finial, 0x8d93a8, 0, 1).translate(0, 2.55, 0));
  // blade: white rim slightly larger behind the blue plate, mounted proud of
  // the pole face on two brackets so the pole never pokes through it
  parts.push(box(0.16, 0.055, 0.11, 0x1c2440).translate(0.1, 2.33, 0.02));
  parts.push(box(0.16, 0.055, 0.11, 0x1c2440).translate(0.1, 2.07, 0.02));
  parts.push(box(1.02, 0.46, 0.035, 0xd6dcf0).translate(0.44, 2.2, 0.065));
  parts.push(box(0.94, 0.38, 0.07, PAL.blueBright, 1.05).translate(0.44, 2.2, 0.075));
  parts.push(box(0.94, 0.07, 0.072, 0x48a8f0, 1.1).translate(0.44, 2.33, 0.075));  // top-light facet
  // diamond plate below, on its own backing so the orange has an edge
  const back = box(0.48, 0.48, 0.03, 0xd6dcf0); back.rotateZ(Math.PI / 4); back.translate(0, 1.55, 0.055);
  const dia = box(0.4, 0.4, 0.05, PAL.orange); dia.rotateZ(Math.PI / 4); dia.translate(0, 1.55, 0.08);
  parts.push(back, dia);
  parts.push(tube(0.07, 0.07, 0.07, 6, 0x0d1b3e).rotateX(Math.PI / 2).translate(0, 1.55, 0.118));
  return faceShade(mergeParts(parts));
}

// ---------------------------------------------------------------------------
// TREE — a flared trunk that tapers all the way up, three branches lifting into
// the crown, and a canopy of five overlapping lobes with their own tints (6 m).
// One ball on a stick is what this was; a single icosahedron has one silhouette
// from every angle and the four sun tones landed on it in neat bands, so it read
// as a flat orange planet. The lobes are the fix — different sizes, different
// offsets, different base tints, and a wobble that stops any of them from
// looking like the primitive it came from.
const CANOPY_TONES = [0xf0a860, 0xd89048, 0xc07830, 0x904818].map((h) => new THREE.Color(h));
const SUN = new THREE.Vector3(-0.6, 0.55, -0.35).normalize();

// Deterministic 0..1 from a quantised direction. PolyhedronGeometry hands back
// one vertex per FACE CORNER, so every corner of the shell exists three to five
// times over; keying the wobble off the DIRECTION rather than the vertex index
// gives each copy the same displacement and the shell stays welded instead of
// splitting into loose triangles.
function dirHash(x, y, z) {
  const s = Math.sin(Math.round(x * 48) * 12.9898 + Math.round(y * 48) * 78.233 + Math.round(z * 48) * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

// One canopy lobe. `tint` is what separates it from its neighbours: the four
// sun-facing tones alone made every lobe the same lobe, which is precisely how
// the old single ball managed to be four colours and still look flat.
function canopyLobe(r, squash, detail, tint, wobble) {
  const g = new THREE.IcosahedronGeometry(r, detail).toNonIndexed();
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + (dirHash(x / r, y / r, z / r) - 0.5) * wobble;
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  g.scale(1, squash, 1);
  g.computeVertexNormals();
  const nor = g.getAttribute('normal');
  const col = new Float32Array(pos.count * 3);
  const N = new THREE.Vector3();
  for (let f = 0; f < pos.count; f += 3) {
    N.set(
      (nor.getX(f) + nor.getX(f + 1) + nor.getX(f + 2)) / 3,
      (nor.getY(f) + nor.getY(f + 1) + nor.getY(f + 2)) / 3,
      (nor.getZ(f) + nor.getZ(f + 1) + nor.getZ(f + 2)) / 3,
    ).normalize();
    const lit = N.dot(SUN); // 1 sun-facing … −1 shade
    const tone = lit > 0.45 ? 0 : lit > -0.05 ? 1 : lit > -0.5 ? 2 : 3;
    const c = CANOPY_TONES[tone];
    // facet-to-facet break-up on top of the tone bands, so neighbouring faces
    // in the same band still separate
    const m = tint * (0.91 + dirHash(N.x, N.y, N.z) * 0.18);
    for (let v = 0; v < 3; v++) { col[(f + v) * 3] = c.r * m; col[(f + v) * 3 + 1] = c.g * m; col[(f + v) * 3 + 2] = c.b * m; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aInterior', new THREE.BufferAttribute(new Float32Array(pos.count).fill(0), 1));
  g.setAttribute('aSurface', new THREE.BufferAttribute(new Float32Array(pos.count).fill(SURF.FOLIAGE), 1));
  return g;
}

export function treeGeo() {
  const BARK = 0x6b4a26, DARKBARK = 0x4a3118;
  const wood = [];
  // Root flare. PROP_TYPES gives this prop r 0.5 and the trunk proper is a third
  // of that, so without a flare the tree stands on a pencil — which is the other
  // half of why it read as a lollipop.
  wood.push(tube(0.27, 0.5, 0.5, 7, BARK, 1, SURF.WOOD).translate(0, 0.25, 0));
  wood.push(tube(0.165, 0.27, 1.85, 7, BARK, 1, SURF.WOOD).translate(0, 1.425, 0));
  wood.push(tube(0.11, 0.165, 0.9, 6, DARKBARK, 1, SURF.WOOD).translate(0, 2.8, 0));
  // three buttresses running down the flare, widest where they meet the ground
  for (let i = 0; i < 3; i++) {
    const bt = hull(
      [[0.13, 0, -0.16], [0.5, 0, -0.13], [0.5, 0, 0.13], [0.13, 0, 0.16]],
      [[0.07, 0.52, -0.05], [0.24, 0.52, -0.05], [0.24, 0.52, 0.05], [0.07, 0.52, 0.05]],
      i === 1 ? DARKBARK : BARK, { surf: SURF.WOOD },
    );
    bt.rotateY(0.55 + i * 2.09);
    wood.push(bt);
  }
  // Branches: two lifting out into the crown and one crossing back the other
  // way, so the canopy has something to sit ON. Four-sided and open — both ends
  // are buried, in the trunk and in a lobe.
  const branch = (len, rt, rb, tilt, az, x, y, z, c) => {
    const b = tube(rt, rb, len, 4, c, 1, SURF.WOOD);
    b.translate(0, len / 2, 0);
    b.rotateZ(tilt);
    b.rotateY(az);
    b.translate(x, y, z);
    return b;
  };
  wood.push(branch(1.5, 0.055, 0.105, 0.6, 0.5, 0.04, 2.2, 0.02, BARK));
  wood.push(branch(1.35, 0.05, 0.095, -0.66, -0.4, -0.04, 2.4, -0.02, DARKBARK));
  wood.push(branch(1.0, 0.045, 0.085, 0.5, 2.5, 0, 2.65, 0, BARK));
  // the woody half takes the same baked sun the rest of the props take; the
  // canopy does not, because its tones are authored against SUN above
  const parts = [faceShade(mergeParts(wood))];
  // Offsets are deliberately less than a radius apart: pushed further out the
  // lobes stop overlapping and the crown reads as a pile of boulders instead of
  // one canopy with bumps in it.
  parts.push(canopyLobe(1.55, 0.92, 1, 0.98, 0.22).translate(0, 4.15, 0));
  parts.push(canopyLobe(1.05, 0.95, 0, 0.8, 0.18).translate(-0.82, 3.82, -0.42));
  parts.push(canopyLobe(1.0, 0.95, 0, 1.08, 0.18).translate(0.88, 3.98, 0.3));
  parts.push(canopyLobe(0.95, 0.9, 0, 1.16, 0.18).translate(0.12, 4.92, -0.12));
  parts.push(canopyLobe(0.85, 0.95, 0, 0.86, 0.18).translate(0.1, 3.6, 0.8));
  return mergeParts(parts);
}

// ---------------------------------------------------------------------------
// NEWS KIOSK — raked awning over a projecting counter, cream signboard above a
// roof slab, stocked open front, poster frame on the blind side (2.6 m)
const RACK_COLORS = [0x3090f0, 0xf0a860, 0x48a8f0, 0xd89048, 0xf5f0e0, 0x1878d8];

export function kioskGeo() {
  const parts = [];
  // Body kicks in as it rises so the roof and the awning OVERHANG it. A straight
  // extrusion is what made this read as a painted crate.
  parts.push(box(2.34, 0.14, 1.64, 0x0d1b3e).translate(0, 0.07, 0));       // plinth
  parts.push(hull(ring(2.2, 2.2, -0.75, 0.75, 0.14), ring(2.12, 2.12, -0.72, 0.72, 1.98), 0x1848c0));
  for (const [x, z, c] of [[-1.06, 0.71, PAL.blueBright], [1.06, 0.71, PAL.blueDeep],
    [-1.06, -0.71, PAL.blueDeep], [1.06, -0.71, PAL.blueDeep]]) {
    parts.push(box(0.1, 1.84, 0.1, c).translate(x, 1.06, z));              // corner posts
  }
  parts.push(box(2.28, 0.1, 1.62, 0x0d1b3e).translate(0, 2.03, 0));        // roof slab, overhanging
  // Signboard, standing proud of the roofline on its own rails so it catches
  // the last of the sun instead of sitting flush like a sticker.
  parts.push(box(2.42, 0.44, 0.2, 0xf5f0e0, 1.05, SURF.LAMP).translate(0, 2.3, 0.02));   // lit signboard
  parts.push(box(2.5, 0.08, 0.25, PAL.blueDeep).translate(0, 2.54, 0.02));
  parts.push(box(2.5, 0.06, 0.25, PAL.blueDeep).translate(0, 2.06, 0.02));
  parts.push(box(0.9, 0.16, 0.21, 0x0d1b3e).translate(0, 2.3, 0.03));      // abstract lettering band
  // Awning: a slab RAKED down toward the street with a scalloped valance on its
  // lip. The flat band it replaces read as a shelf.
  parts.push(hull(ring(2.5, 2.5, -0.02, 1.02, 2.02, 1.85), ring(2.5, 2.5, -0.02, 1.02, 2.08, 1.91), PAL.orange));
  for (let i = 0; i < 6; i++) {
    const sc = new THREE.CylinderGeometry(0.19, 0.19, 0.3, 5, 1, false, Math.PI, Math.PI).toNonIndexed();
    sc.rotateX(Math.PI / 2);
    sc.rotateZ(Math.PI / 2);
    sc.translate(-0.99 + i * 0.397, 1.79, 0.94);
    parts.push(tagGeometry(sc, i % 2 ? 0xf5f0e0 : PAL.orangeBright, 0, 1.05));
  }
  // open front: dark opening, magazine facets, rolled shutter above
  parts.push(box(1.56, 1.04, 0.08, 0x0d1b3e).translate(-0.22, 1.44, 0.72));
  parts.push(tube(0.09, 0.09, 1.6, 6, 0x5b6178).rotateZ(Math.PI / 2).translate(-0.22, 1.92, 0.73));
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 4; i++) {
      parts.push(box(0.24, 0.28, 0.05, RACK_COLORS[(i + row * 3) % RACK_COLORS.length], 1.05)
        .translate(-0.7 + i * 0.32, 1.56 - row * 0.34, 0.76));
    }
  }
  // Counter: a slab that overhangs the body, a fascia under its lip and two
  // struts back to the wall — the serving hatch had nothing to stand on.
  parts.push(box(1.74, 0.1, 0.46, 0x9aa3bd).translate(-0.22, 0.93, 0.86));
  parts.push(box(1.68, 0.14, 0.06, 0x5b6178).translate(-0.22, 0.83, 1.06));
  for (const x of [-0.92, 0.48]) {
    const br = box(0.07, 0.07, 0.46, 0x5b6178);
    br.rotateX(0.72);
    br.translate(x, 0.74, 0.88);
    parts.push(br);
  }
  // poster frame on the right flank
  parts.push(box(0.06, 0.85, 0.6, 0xf5f0e0).translate(1.09, 1.25, -0.1));
  parts.push(box(0.065, 0.5, 0.44, 0x1848c0).translate(1.095, 1.4, -0.1));
  parts.push(tube(0.12, 0.12, 0.08, 8, 0xf0a860).rotateZ(Math.PI / 2).translate(1.1, 1.4, -0.1));
  return faceShade(mergeParts(parts));
}

// ---------------------------------------------------------------------------
// CARS — sedan / taxi / van per the vehicle sheet. Fixed topology so the
// crush/deform path stays safe; wrecks reuse the sedan shell.
// Ground clearance: every kind is built up from a wheel-contact plane at y = 0,
// so this is also the height of the chassis underside — the face a pair of hands
// actually grips when the car goes overhead. Exported for that reason. The sill
// hull below is the lowest bodywork on every kind and its bottom ring sits at
// exactly this height, which is what keeps the number honest.
export const CAR_CLEARANCE = 0.32;

export function carGeo(kind = 'sedan') {
  const K = {
    sedan: { L: 4.4, W: 1.85, bodyH: 0.6, cabinH: 0.52, color: 0x2a63d4, lit: 0x3090f0, dark: 0x003090, glass: 0x2c4a7e },
    taxi: { L: 4.4, W: 1.85, bodyH: 0.62, cabinH: 0.55, color: PAL.orange, lit: 0xe09c54, dark: PAL.orangeDeep, glass: 0x2c4a7e },
    van: { L: 4.9, W: 2.0, bodyH: 1.5, cabinH: 0, color: 0x1848c0, lit: 0x1878d8, dark: 0x003090, glass: 0x2c4a7e },
    wreck: { L: 4.4, W: 1.85, bodyH: 0.6, cabinH: 0.5, color: 0x3a3f52, lit: 0x474d63, dark: 0x22242e, glass: 0x22242e },
  }[kind];
  const parts = [];
  const cl = CAR_CLEARANCE;
  const W = K.W, L = K.L;
  const front = L / 2; // +z is the nose
  const wheelR = 0.34, wheelZ = front - 0.85, wheelX = W / 2 - 0.1;
  // Arch liners are near-black on every kind, not a shade of the body: K.dark on
  // the taxi is another mid-orange and the arch disappeared into the wing, and a
  // multiplied body colour lands too light once it has been through the sRGB
  // round trip. A dark liner is also simply what is behind a wheel.
  const ARCH = 0x141a26;

  if (kind === 'van') {
    const roof = cl + K.bodyH;
    // sill tucks under and flares out to full width, cargo box leans in at the
    // roof, bonnet drops away in front of a raked screen
    parts.push(hull(ring(W * 0.84, W * 0.88, -front + 0.2, front - 0.2, cl),
      ring(W * 0.96, W, -front + 0.04, front - 0.04, cl + 0.14), K.dark));
    parts.push(hull(ring(W * 0.96, W * 0.98, -front + 0.04, front - 0.72, cl + 0.14),
      ring(W * 0.92, W * 0.94, -front + 0.08, front - 0.7, roof), K.color));
    parts.push(hull(ring(W * 0.98, W * 0.94, front - 0.72, front - 0.04, cl + 0.14),
      ring(W * 0.96, W * 0.9, front - 0.75, front - 0.09, cl + 0.7), K.color));
    parts.push(hull(ring(W * 0.96, W * 0.9, front - 0.75, front - 0.09, cl + 0.7),
      ring(W * 0.92, W * 0.9, front - 0.73, front - 0.67, roof), K.color));
    parts.push(rakedPane(W * 0.82, front - 0.11, cl + 0.78, front - 0.69, roof - 0.05, 1, K.glass));
    for (const sx of [1, -1]) {
      const p = pane(0.52, 0.36, K.glass);
      p.rotateY(sx * Math.PI / 2);
      p.translate(sx * (W * 0.47 + 0.012), cl + 1.02, front - 0.62);
      parts.push(p);
    }
    parts.push(box(W * 0.96, 0.06, L - 1.1, K.lit, 1.06).translate(0, roof + 0.02, -0.3));   // roof rail
    parts.push(box(W + 0.02, 0.86, 0.05, K.dark).translate(0, cl + 0.72, -0.5));            // sliding-door seam
    parts.push(box(W * 0.74, 1.05, 0.04, K.dark).translate(0, cl + 0.78, -front + 0.03));   // rear doors
  } else {
    const belt = cl + K.bodyH;
    const drop = 0.09;                       // how far the bonnet falls to the nose
    // sill, then the body proper: wider at the nose than at the tail and losing
    // height as it runs forward, which is the taper the flat slab never had
    parts.push(hull(ring(W * 0.8, W * 0.84, -front + 0.22, front - 0.22, cl),
      ring(W * 0.96, W, -front + 0.03, front - 0.03, cl + 0.2), K.dark));
    parts.push(hull(ring(W * 0.96, W, -front + 0.03, front - 0.03, cl + 0.2),
      ring(W * 0.9, W * 0.95, -front + 0.09, front - 0.06, belt, belt - drop), K.color));
    // beltline: a bright rub strip standing proud of the shoulder and following
    // the same fall, so the flank has a line running through it
    parts.push(hull(ring(W * 0.955, W * 1.005, -front + 0.08, front - 0.06, belt - 0.13, belt - 0.13 - drop),
      ring(W * 0.945, W * 0.995, -front + 0.08, front - 0.06, belt - 0.05, belt - 0.05 - drop), K.lit, { shade: 1.08 }));
    // cabin: narrower than the body, sunk a little into it, raked hard at the
    // screen and less so at the backlight
    const cabL = L * 0.46, cabZ = -L * 0.06;
    const zRB = cabZ - cabL / 2, zFB = cabZ + cabL / 2;
    const zRT = cabZ - cabL * 0.34, zFT = cabZ + cabL * 0.3;
    const y0 = belt - 0.03, y1 = belt - 0.03 + K.cabinH;
    parts.push(hull(ring(W * 0.86, W * 0.86, zRB, zFB, y0), ring(W * 0.86, W * 0.86, zRT, zFT, y1), K.color));
    parts.push(rakedPane(W * 0.78, zFB, y0 + 0.07, zFT, y1 - 0.04, 1, K.glass));
    parts.push(rakedPane(W * 0.72, zRB, y0 + 0.07, zRT, y1 - 0.04, -1, K.glass));
    for (const sx of [1, -1]) {
      const p = pane(cabL * 0.54, K.cabinH * 0.55, K.glass);
      p.rotateY(sx * Math.PI / 2);
      p.translate(sx * (W * 0.43 + 0.012), y0 + K.cabinH * 0.52, cabZ - cabL * 0.03);
      parts.push(p);
    }
    // wing mirrors — two small boxes, and the only thing on the car that reads
    // at a glance as "this end is the front"
    for (const sx of [1, -1]) parts.push(box(0.14, 0.07, 0.06, K.dark).translate(sx * W * 0.5, belt + 0.04, zFB - 0.06));
    if (kind === 'taxi') {
      // cream roof sign with checker dots + checker beltline both flanks
      parts.push(box(0.72, 0.2, 0.34, 0xf5f0e0, 1.15).translate(0, y1 + 0.1, cabZ));
      for (let i = 0; i < 3; i++) parts.push(box(0.1, 0.21, 0.1, 0x0d1b3e).translate(-0.2 + i * 0.2, y1 + 0.1, cabZ + 0.13));
      for (let i = 0; i < 8; i++) {
        const zc = -L / 2 + 0.72 + i * 0.42;
        parts.push(box(0.03, 0.17, 0.21, i % 2 ? 0x0d1b3e : 0xf5f0e0).translate(W / 2 + 0.005, cl + K.bodyH * 0.5, zc));
        parts.push(box(0.03, 0.17, 0.21, i % 2 ? 0xf5f0e0 : 0x0d1b3e).translate(-W / 2 - 0.005, cl + K.bodyH * 0.5, zc));
      }
    }
  }

  // bumpers, grille, lights (shared)
  parts.push(box(W * 0.99, 0.2, 0.2, 0x1c2438).translate(0, cl + 0.11, front - 0.05));
  parts.push(box(W * 0.99, 0.2, 0.2, 0x1c2438).translate(0, cl + 0.11, -front + 0.05));
  const lightY = cl + (kind === 'van' ? 0.62 : K.bodyH * 0.68);
  parts.push(box(W * 0.56, 0.15, 0.05, 0x141a30).translate(0, lightY, front - 0.02));       // grille
  // Headlights are lamp lenses and the shader has an id for exactly that: 11
  // adds the sodium term after dark, so a car coming down the street at night
  // has its lights on without a single extra light in the scene. A wreck's are
  // smashed — plain glass, no glow.
  const lampSurf = kind === 'wreck' ? SURF.GLASS : SURF.LAMP;
  for (const sx of [1, -1]) {
    parts.push(box(0.3, 0.13, 0.06, 0xffe9b8, 1.5, lampSurf).translate(sx * (W / 2 - 0.28), lightY, front + 0.005));
    parts.push(box(0.26, 0.11, 0.06, 0xd23a2a, 1.2, SURF.GLASS).translate(sx * (W / 2 - 0.26), lightY, -front - 0.005));
  }
  // wheels: tyre, an outboard hub face only (the inboard cap is under the car and
  // never seen), and the arch flare that frames the whole opening
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const wz = sz * wheelZ, wx = sx * wheelX;
    const w = cyl(wheelR, wheelR, 0.26, 8, 0x14181f);
    w.rotateZ(Math.PI / 2);
    w.translate(wx, wheelR, wz);
    parts.push(w);
    const hub = new THREE.CircleGeometry(0.16, 8).toNonIndexed();
    hub.rotateY(sx * Math.PI / 2);
    hub.translate(wx + sx * 0.135, wheelR, wz);
    parts.push(tagGeometry(hub, 0x8d93a8, 0, 1.05));
    parts.push(archGeo(0.37, 0.5, 0.18, ARCH, sx).translate(sx * (W / 2 + 0.02), wheelR, wz));
  }
  return faceShade(mergeParts(parts));
}
