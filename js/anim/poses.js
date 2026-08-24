// Carry/throw poses for the player rig.
//
// There is no pickup or carry clip in the asset set and no build step to author
// one, so the carry is posed procedurally on top of whatever locomotion is
// playing. Values are EULER OFFSETS FROM THE REST POSE (applied as
// restQ * offsetQ), not absolute local rotations: this rig's bind rotations are
// nowhere near identity, so absolute Eulers would put the arm somewhere random.
//
// These are authored against the PLAYER rig specifically. The rigs share bone
// names and hierarchy but NOT bind rotations (checked: LeftArm differs by ~4°
// between player and npc_a, LeftUpLeg by ~90°), so do not reuse these on NPCs or
// monsters — use the pose layer's additive twists there instead.
export const POSES = {
  // both arms out, weight forward: the frame before the lift
  reach: {
    RightArm: [-1.05, 0.10, 0.30], RightForeArm: [-0.30, 0, 0],
    LeftArm: [-0.95, -0.10, -0.30], LeftForeArm: [-0.30, 0, 0],
    Spine02: [0.14, 0, 0], neck: [0.10, 0, 0],
  },
  // one hand clamped round a neck, held out at arm's length
  carry_neck: {
    RightArm: [-1.45, 0.28, 0.12], RightForeArm: [-0.45, 0, 0.22], RightHand: [0, 0, 0.28],
    LeftArm: [-0.30, 0, -0.18], LeftForeArm: [-0.55, 0, 0],
    Spine02: [-0.07, 0, -0.06], Spine01: [0, 0, -0.04],
  },
  // both arms locked out overhead, spine arched back under the load
  carry_overhead: {
    RightArm: [-2.45, 0, 0.30], RightForeArm: [-0.26, 0, 0],
    LeftArm: [-2.45, 0, -0.30], LeftForeArm: [-0.26, 0, 0],
    Spine02: [-0.18, 0, 0], Spine01: [-0.09, 0, 0], neck: [-0.15, 0, 0],
  },
  // arms swung through, torso whipped forward
  throw_release: {
    RightArm: [-2.85, 0, 0.12], RightForeArm: [-0.10, 0, 0],
    LeftArm: [-2.85, 0, -0.12], LeftForeArm: [-0.10, 0, 0],
    Spine02: [0.32, 0, 0], Spine01: [0.12, 0, 0],
  },
};

// The spine carries the locomotion's whole read, so it only half-commits to a
// pose — otherwise the run cycle dies from the waist up while carrying.
export const BONE_WEIGHT = { Spine: 0.5, Spine01: 0.55, Spine02: 0.7, neck: 0.6 };
