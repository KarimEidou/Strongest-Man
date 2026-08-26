// GLB registry. Every model was pre-processed by tools/optimize-glb.mjs
// (meshopt-compressed, WebP textures, grounded origins, metric scale).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { makeCharacterMaterial } from './materials.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export const MODELS = {}; // name -> { scene, animations }

// Characters, monsters, three props and the samosa landmark are this project's
// own lifts. The street furniture, the traffic and the weapons are Kenney CC0
// packs brought in by tools/import-models.mjs — see assets/CREDITS.md.
// Everything in the second group has been merged to a single mesh with a single
// palette atlas by that tool, which is what staticGeometry() below assumes.
const LIST = [
  'player', 'npc_a', 'npc_b', 'monster_a', 'monster_b',
  'prop_hydrant', 'prop_bench', 'prop_dumpster',
  'landmark_samosa',
  'prop_streetlamp', 'prop_trafficlight', 'prop_sign', 'prop_tree', 'prop_kiosk',
  'car_sedan', 'car_taxi', 'car_van', 'car_police', 'car_wreck',
  'gun_pistol', 'gun_smg', 'gun_rifle', 'gun_shotgun', 'gun_sniper', 'gun_cannon',
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

// A quantized attribute (KHR_mesh_quantization, which both asset tools emit)
// arrives as NORMALIZED integers: the real value is the stored one over the
// type's range, and the node transform scales it back out. That is fine to draw
// and fatal to bake into — BufferAttribute.setXYZ re-normalizes on the way in,
// so writing a value the wrapper node was going to multiply by 8 silently clamps
// it at the quantization box. It looked like a 5.6m streetlamp collapsing to a
// 1m stub and a tree turning inside out. Widening to float first costs a few KB
// of RAM per prop type, once, and makes the bake exact.
function toFloat(attr) {
  if (attr.array instanceof Float32Array && !attr.normalized) return attr;
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) {
    for (let c = 0; c < attr.itemSize; c++) out[i * attr.itemSize + c] = attr.getComponent(i, c);
  }
  return new THREE.BufferAttribute(out, attr.itemSize);
}

// Extract the merged static geometry of a model (props/cars/guns) with its
// texture, for building InstancedMesh pools. Assumes single mesh (both asset
// pipelines enforce it).
export function staticGeometry(name) {
  let found = null;
  MODELS[name].scene.traverse((o) => { if (o.isMesh && !found) found = o; });
  const geo = found.geometry.clone();
  for (const key of Object.keys(geo.attributes)) geo.setAttribute(key, toFloat(geo.attributes[key]));
  found.updateWorldMatrix(true, false);
  geo.applyMatrix4(found.matrixWorld); // bake grounding/scale wrapper nodes
  return { geometry: geo, material: found.material };
}
