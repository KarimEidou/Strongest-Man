// GLB registry. Every model was pre-processed by tools/optimize-glb.mjs
// (meshopt-compressed, WebP textures, grounded origins, metric scale).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { makeCharacterMaterial } from './materials.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export const MODELS = {}; // name -> { scene, animations }

// only models that passed visual QA ship; failed lifts were replaced by
// procedural geometry in world/procprops.js
const LIST = [
  'player', 'npc_a', 'npc_b', 'monster_a', 'monster_b',
  'prop_hydrant', 'prop_bench', 'prop_dumpster',
];
const CLIPS = ['clip_run', 'clip_punch', 'clip_die'];

export async function loadModels(onProgress) {
  let done = 0;
  const total = LIST.length + CLIPS.length;
  const jobs = [...LIST.map((n) => ['models', n]), ...CLIPS.map((n) => ['anim', n])];
  await Promise.all(jobs.map(async ([dir, name]) => {
    const gltf = await loader.loadAsync(`./assets/${dir}/${name}.glb`);
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = true;
        if (o.material) {
          const src = o.material;
          if (src.map) src.map.colorSpace = THREE.SRGBColorSpace;
          // These GLBs carry a baked base-colour texture and NOTHING else — no
          // normal, roughness, metalness or occlusion map anywhere in the set,
          // and a metalness FACTOR of 1.0 with no map, which is why swapping the
          // PBR material out was right in the first place (MeshStandard would
          // render them near-black without an environment). So the upgrade is not
          // "keep the PBR", it is to give the characters the same lighting model
          // the city already has: a specular lobe, a sky rim, and the streetlamps.
          // Static props keep the plain Lambert here — world/props.js rebuilds
          // them on the shared world material, which needs the raw map off this.
          o.material = o.isSkinnedMesh
            ? makeCharacterMaterial(src)
            : new THREE.MeshLambertMaterial({ map: src.map || null, color: src.color?.clone() || new THREE.Color(1, 1, 1) });
        }
      }
    });
    MODELS[name] = { scene: gltf.scene, animations: gltf.animations };
    done++;
    onProgress?.(done / total);
  }));
}

// Extract the merged static geometry of a model (props/cars) with its texture,
// for building InstancedMesh pools. Assumes single mesh (pipeline enforces it).
export function staticGeometry(name) {
  let found = null;
  MODELS[name].scene.traverse((o) => { if (o.isMesh && !found) found = o; });
  const geo = found.geometry.clone();
  found.updateWorldMatrix(true, false);
  geo.applyMatrix4(found.matrixWorld); // bake grounding/scale wrapper nodes
  return { geometry: geo, material: found.material };
}
