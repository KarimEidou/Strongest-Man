// Real sun shadows, affordably.
//
// The naive approach — castShadow on the building meshes — is a non-starter
// here: the facades are ~3,400 instanced cells with frustumCulled off, so every
// shadow update would redraw ~100k triangles. Instead the casters are PROXIES:
// one InstancedMesh of boxes, one per building/car, living on layer 2. The
// shadow pass tests each object against the LIGHT's layer mask, so enabling
// layer 2 on the sun makes the proxy visible to the shadow map and to nothing
// else — the camera never sees it. Cost: one draw call, ~200 triangles.
//
// The player and monsters cast from their real skinned meshes, because a boxy
// silhouette under the character you are looking at is worse than no shadow.
// The 48 townsfolk keep their blob shadows.
import * as THREE from 'three';
import { FLOOR_H } from '../world/city.js';

export const LAYER_SHADOW = 2;
export const LAYER_OCCLUDER = 3;

const CAP = 64;
// The roof instance sits 0.10m proud of floors * FLOOR_H (see world/buildings.js),
// so the proxy has to reach that high or roofs self-shadow against their own box.
const ROOF_PROUD = 0.1;

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const centre = new THREE.Vector3(), fwd = new THREE.Vector3(), lightPos = new THREE.Vector3();
const byDistance = (a, b) => a.d2 - b.d2;
const fLight = new THREE.Vector3(), rLight = new THREE.Vector3(), uLight = new THREE.Vector3();

export function initShadows(renderer, scene, sun, buildingsReg, traffic, tier) {
  // black, unlit, never drawn for the camera — only its depth matters
  const proxyMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const proxy = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), proxyMat, CAP);
  proxy.castShadow = true;
  proxy.frustumCulled = false;
  proxy.name = 'shadowProxy';
  proxy.layers.set(LAYER_SHADOW);
  proxy.layers.enable(LAYER_OCCLUDER);
  for (let i = 0; i < CAP; i++) proxy.setMatrixAt(i, ZERO);
  proxy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(proxy);

  sun.layers.enable(LAYER_SHADOW);
  sun.layers.enable(LAYER_OCCLUDER);
  sun.castShadow = true;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.045;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;

  let extent = 34, every = 3, enabled = false, frame = 0;

  function setTier(t) {
    enabled = !!t.shadows;
    renderer.shadowMap.enabled = enabled;
    // PCFShadowMap, deliberately, at every tier. PCFSoftShadowMap renders the
    // entire lit scene black on at least one driver we can test against
    // (ANGLE/SwiftShader), which is a catastrophic failure mode for a marginally
    // softer edge — resolution and normalBias buy the quality back instead.
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    every = t.shadowEvery || 3;
    if (t.shadowSize) {
      sun.shadow.mapSize.set(t.shadowSize, t.shadowSize);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    sun.castShadow = enabled;
  }
  setTier(tier);

  // Called between the god-ray mask render and the main render: shadowMap
  // needsUpdate is consumed by the NEXT render() call, whichever that is.
  function beforeRender(playerPos, camera, sunDir) {
    if (!enabled) return;
    frame++;
    if (frame % every !== 0) return;

    repack(playerPos);

    // cover what the player is looking at, not what is behind them
    camera.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    centre.set(playerPos.x, 0, playerPos.z).addScaledVector(fwd, extent * 0.45);

    // Texel snapping, in the light's own basis. Without this a following ortho
    // shadow crawls under the player's feet every frame and reads as a bug.
    const texel = (extent * 2) / (sun.shadow.mapSize.x || 1024);
    fLight.copy(sunDir).multiplyScalar(-1).normalize();          // light's view dir
    rLight.set(0, 1, 0).cross(fLight);
    if (rLight.lengthSq() < 1e-6) rLight.set(1, 0, 0);
    rLight.normalize();
    uLight.copy(fLight).cross(rLight).normalize();
    const sx = centre.dot(rLight), sy = centre.dot(uLight);
    centre.addScaledVector(rLight, Math.round(sx / texel) * texel - sx)
      .addScaledVector(uLight, Math.round(sy / texel) * texel - sy);

    lightPos.copy(sunDir).multiplyScalar(120).add(centre);
    sun.position.copy(lightPos);
    sun.target.position.copy(centre);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();

    const cam = sun.shadow.camera;
    cam.left = -extent; cam.right = extent;
    cam.top = extent; cam.bottom = -extent;
    cam.updateProjectionMatrix();

    renderer.shadowMap.needsUpdate = true;
  }

  // One box per building and car, NEAREST FIRST. The old version packed the
  // registry in order and appended cars last, behind a RANGE test that could
  // never fire (RANGE 90 vs a 71.5m map): the first seed to push past CAP would
  // have silently dropped every car shadow, and past 64 whole buildings would
  // stop occluding. Sorting by distance makes the cap degrade gracefully.
  // Preallocated, because this runs on the shadow cadence and must not allocate.
  const cand = Array.from({ length: 192 }, () => ({ b: null, c: null, cx: 0, cz: 0, d2: Infinity }));

  function repack(playerPos) {
    let n = 0;
    for (const b of buildingsReg.buildings) {
      if (n >= cand.length) break;
      if (b.collapsed) continue;
      const s = b.spec;
      const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
      const dx = cx - playerPos.x, dz = cz - playerPos.z;
      const e = cand[n++];
      e.b = b; e.c = null; e.cx = cx; e.cz = cz; e.d2 = dx * dx + dz * dz;
    }
    for (const c of traffic.list) {
      if (n >= cand.length) break;
      if (c.mode === 'held' || c.mode === 'flying') continue;
      const dx = c.x - playerPos.x, dz = c.z - playerPos.z;
      const e = cand[n++];
      e.b = null; e.c = c; e.d2 = dx * dx + dz * dz;
    }
    for (let k = n; k < cand.length; k++) { cand[k].b = null; cand[k].c = null; cand[k].d2 = Infinity; }
    cand.sort(byDistance);

    let i = 0;
    for (; i < CAP && i < n; i++) {
      const e = cand[i];
      if (e.b) {
        const s = e.b.spec;
        const h = s.floors * FLOOR_H + ROOF_PROUD;
        Q.identity();
        M.compose(V.set(e.cx, h / 2, e.cz), Q, S.set(s.x1 - s.x0, h, s.z1 - s.z0));
      } else {
        Q.setFromAxisAngle(V.set(0, 1, 0), e.c.yaw);
        M.compose(V.set(e.c.x, 0.75, e.c.z), Q, S.set(e.c.hw * 2, 1.5, e.c.hl * 2));
      }
      proxy.setMatrixAt(i, M);
    }
    for (; i < CAP; i++) proxy.setMatrixAt(i, ZERO);
    proxy.instanceMatrix.needsUpdate = true;
  }

  return {
    proxy,
    beforeRender,
    setTier,
    get enabled() { return enabled; },
  };
}

// Characters cast from their real mesh so the silhouette is a person, not a box.
export function setCharacterCasting(root, on) {
  root.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) o.castShadow = on; });
}
