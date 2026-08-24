// Boot entry. Verifies the vendored three.js loads from the Pages subpath;
// the game systems are wired in here as they land.
import * as THREE from 'three';

const msg = document.getElementById('boot-msg');
msg.textContent = `BOOT OK — three r${THREE.REVISION} — game modules land in the next commits`;
