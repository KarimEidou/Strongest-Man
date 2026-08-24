// Boot-time shader warm-up.
//
// three.js builds a material's GPU program the first time it actually renders.
// Anything hidden at boot therefore compiles mid-gameplay — and every one of
// those moments is dramatic: the shockwave ring on your first charged punch, the
// "!" sprite the instant a monster works out what you are. On a phone that is a
// multi-hundred-millisecond stall exactly when the player is looking.
//
// So: park every deferred material in the scene, compile the lot behind the
// loading screen, render one throwaway frame (compile() does not build the
// shadow-depth variants, only a real render does), then put it all back.
import * as THREE from 'three';

export async function warmUp(renderer, scene, camera, extraMaterials = []) {
  const parked = [];
  for (const mat of extraMaterials) {
    if (!mat) continue;
    const o = mat.isSpriteMaterial ? new THREE.Sprite(mat)
      : new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), mat);
    o.position.set(0, -400, 0);   // far under the map, inside no frustum that matters
    o.frustumCulled = false;
    scene.add(o);
    parked.push(o);
  }

  // reveal anything the scene keeps hidden so it is included in the pass
  const hidden = [];
  scene.traverse((o) => {
    if (o.visible === false) { hidden.push(o); o.visible = true; }
  });

  try {
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
    // one real frame: builds depth/shadow program variants too. The loading
    // overlay is opaque and still up, so nothing of this reaches the player.
    renderer.render(scene, camera);
  } catch { /* warm-up is best-effort; never block boot on it */ }

  for (const o of hidden) o.visible = false;
  for (const o of parked) {
    scene.remove(o);
    if (o.geometry) o.geometry.dispose();
  }
  renderer.info.reset();
}
