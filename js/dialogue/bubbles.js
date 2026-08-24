// Speech bubbles: DOM nodes projected from character heads. Max four at once
// (nearest win), short-lived, hidden behind the camera or beyond 25m.
import * as THREE from 'three';

const MAX = 4;
const active = []; // {el, get3d, t, life}
let layer, camera;
const V = new THREE.Vector3();

export function initBubbles(cam) {
  layer = document.getElementById('bubbles');
  camera = cam;
}

export function say(get3d, text, { life = 3.4, cls = '', key } = {}) {
  if (!layer) return;
  // one bubble per speaker: replace
  const k = key ?? get3d;
  for (const b of active) {
    if (b.key === k) { b.el.textContent = text; b.el.className = `bubble ${cls}`; b.t = 0; b.life = life; b.get3d = get3d; return; }
  }
  if (active.length >= MAX) {
    const oldest = active.shift();
    oldest.el.remove();
  }
  const el = document.createElement('div');
  el.className = `bubble ${cls}`;
  el.textContent = text;
  layer.appendChild(el);
  active.push({ el, get3d, key: k, t: 0, life });
}

export function bubblesFrame(dt) {
  if (!layer) return;
  const w = layer.clientWidth, h = layer.clientHeight;
  for (let i = active.length - 1; i >= 0; i--) {
    const b = active[i];
    b.t += dt;
    if (b.t >= b.life) { b.el.remove(); active.splice(i, 1); continue; }
    const p = b.get3d();
    if (!p) { b.el.remove(); active.splice(i, 1); continue; }
    V.set(p.x, p.y, p.z);
    const dist2 = camera.position.distanceToSquared(V);
    V.project(camera);
    if (V.z > 1 || V.z < -1 || dist2 > 625) { b.el.style.display = 'none'; continue; }
    b.el.style.display = '';
    b.el.style.transform = `translate(-50%,-100%) translate(${((V.x + 1) / 2) * w}px, ${((1 - V.y) / 2) * h}px)`;
    b.el.style.opacity = b.life - b.t < 0.4 ? String((b.life - b.t) / 0.4) : '1';
  }
}
