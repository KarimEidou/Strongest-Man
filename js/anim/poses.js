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
  // One hand clamped round a neck, held clear of the ground at arm's length.
  // Authored as directions (see below) because the height of the fist is load
  // bearing: a person hangs their own neck-height below it, so an arm that
  // finished at 1.13m — which the old Euler offsets gave — could not hold anyone
  // off the pavement, and the ground clamp in ai/npc.js then had to lift the
  // victim 88cm off the fist that was supposedly at their throat. The fist sits
  // just above the shoulder now, and they dangle.
  carry_neck: {
    RightArm: { dir: [-0.26, 0.24, 0.94] },
    RightForeArm: { dir: [-0.16, 0.22, 0.96] },
    RightHand: { dir: [-0.12, 0.18, 0.98] },
    LeftArm: { dir: [0.34, -0.83, -0.44] },        // the other arm counterweights
    LeftForeArm: { dir: [0.26, -0.72, 0.64] },
    Spine02: { dir: [-0.06, 0.99, -0.11], w: 0.7 },
    Spine01: { dir: [-0.04, 0.995, -0.09], w: 0.55 },
    neck: { dir: [-0.10, 0.97, 0.22], w: 0.6 },    // looking at what he is holding
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
  // Swinging whatever is in your hands at whatever is in front of you. Authored
  // as TARGET DIRECTIONS (see the section below) rather than Euler offsets: the
  // arc is large enough that offsets against an unknown bind pose are guesswork.
  swing_wind: {
    RightArm: { dir: [-0.34, 0.72, -0.61] },        // load cocked back over the shoulder
    RightForeArm: { dir: [-0.21, 0.55, -0.81] },
    LeftArm: { dir: [-0.09, 0.70, -0.71] },
    LeftForeArm: { dir: [-0.26, 0.60, -0.76] },
    Spine02: { dir: [-0.19, 0.96, -0.20], w: 0.9 }, // torso coiled away from the target
    Spine01: { dir: [-0.11, 0.98, -0.15], w: 0.85 },
    neck: { dir: [0.10, 0.96, 0.24], w: 0.7 },      // eyes stay on the target
  },
  swing_follow: {
    RightArm: { dir: [0.54, -0.24, 0.81] },         // whipped through, low and across
    RightForeArm: { dir: [0.62, -0.34, 0.71] },
    LeftArm: { dir: [0.50, -0.29, 0.81] },
    LeftForeArm: { dir: [0.58, -0.39, 0.71] },
    Spine02: { dir: [0.23, 0.94, 0.26], w: 0.9 },
    Spine01: { dir: [0.15, 0.97, 0.19], w: 0.85 },
    neck: { dir: [0.14, 0.95, 0.28], w: 0.7 },
  },
};

// The spine carries the locomotion's whole read, so it only half-commits to a
// pose — otherwise the run cycle dies from the waist up while carrying.
export const BONE_WEIGHT = { Spine: 0.5, Spine01: 0.55, Spine02: 0.7, neck: 0.6 };

// ---------------------------------------------------------------------------
// TARGET-DIRECTION POSES. Each bone says where its axis should POINT, in
// character space: +Z is the way the character faces, +Y is up, +X is its left.
// anim/poselayer.js resolves these against whichever rig it was built on, so one
// table is correct on the player, on npc_a and on npc_b — which matters here,
// because the bind rotations differ by ~8° at the shoulder and far more at the
// hip, and the poses below are large. `w` overrides the default bone weight.
// ---------------------------------------------------------------------------

// Poses for the person in your fist. There is no carry, dangle or struggle clip
// in the asset set, and no build step to author one; the victim used to be run at
// a hardcoded `loco.update(dt, 2.6)`, which is 79% of the quick-walk clip — they
// hung a metre off the pavement doing a brisk walk.
export const VICTIM_POSES = {
  // Standing still: held by the throat from behind, both hands clawing at the
  // forearm across their neck, feet dangling.
  victim_hang: {
    // The pelvis, spine and shoulders are pinned too. Limb directions alone are
    // not enough: a bone's OFFSET still rotates with its parent, so leaving the
    // hips to whatever clip is playing underneath moves the hip and shoulder
    // joints even when the limbs point correctly, and the body reads as broken.
    Hips: { dir: [0, 0.97, -0.24], w: 1 },
    Spine02: { dir: [0, 0.985, -0.17], w: 0.9 },  // arched back off the ground
    Spine01: { dir: [0, 0.99, -0.14], w: 0.9 },
    Spine: { dir: [0, 0.99, -0.15], w: 0.9 },
    LeftShoulder: { dir: [0.95, 0.28, 0.12] },
    RightShoulder: { dir: [-0.95, 0.28, 0.12] },
    RightArm: { dir: [-0.56, 0.61, 0.56] },       // elbow out and forward
    RightForeArm: { dir: [0.60, 0.56, -0.57] },   // forearm back in to the throat
    RightHand: { dir: [0.30, 0.30, -0.90] },
    LeftArm: { dir: [0.56, 0.61, 0.56] },
    LeftForeArm: { dir: [-0.60, 0.56, -0.57] },
    LeftHand: { dir: [-0.30, 0.30, -0.90] },
    RightUpLeg: { dir: [-0.06, -0.95, 0.31] },    // hanging, knees a little bent
    RightLeg: { dir: [-0.05, -0.93, -0.36] },
    RightFoot: { dir: [0, -0.72, 0.69] },         // toes down
    LeftUpLeg: { dir: [0.06, -0.95, 0.31] },
    LeftLeg: { dir: [0.05, -0.93, -0.36] },
    LeftFoot: { dir: [0, -0.72, 0.69] },
    neck: { dir: [0, 0.97, -0.24], w: 0.9 },
    Head: { dir: [0, 0.95, -0.31], w: 0.9 },
  },
  // Being carried at a run: legs trail, body streamlines, grip tightens.
  victim_drag: {
    Hips: { dir: [0, 0.95, -0.32], w: 1 },
    Spine02: { dir: [0, 0.97, -0.25], w: 0.95 },
    Spine01: { dir: [0, 0.98, -0.20], w: 0.95 },
    Spine: { dir: [0, 0.98, -0.21], w: 0.95 },
    LeftShoulder: { dir: [0.96, 0.22, 0.16] },
    RightShoulder: { dir: [-0.96, 0.22, 0.16] },
    RightArm: { dir: [-0.44, 0.72, 0.53] },
    RightForeArm: { dir: [0.52, 0.66, -0.54] },
    RightHand: { dir: [0.28, 0.34, -0.90] },
    LeftArm: { dir: [0.44, 0.72, 0.53] },
    LeftForeArm: { dir: [-0.52, 0.66, -0.54] },
    LeftHand: { dir: [-0.28, 0.34, -0.90] },
    RightUpLeg: { dir: [-0.07, -0.60, -0.80] },   // swept back behind the carrier
    RightLeg: { dir: [-0.06, -0.79, -0.61] },
    RightFoot: { dir: [0, -0.55, -0.84] },
    LeftUpLeg: { dir: [0.07, -0.55, -0.83] },
    LeftLeg: { dir: [0.06, -0.76, -0.65] },
    LeftFoot: { dir: [0, -0.52, -0.85] },
    neck: { dir: [0, 0.94, -0.34], w: 0.95 },
    Head: { dir: [0, 0.92, -0.39], w: 0.95 },
  },
  // Dead weight: nothing grips, everything hangs off the hold.
  victim_limp: {
    Hips: { dir: [0, 0.96, 0.28], w: 1 },
    Spine02: { dir: [0, 0.96, 0.27], w: 0.95 },
    Spine01: { dir: [0, 0.97, 0.22], w: 0.95 },
    Spine: { dir: [0, 0.97, 0.24], w: 0.95 },
    LeftShoulder: { dir: [0.98, -0.10, 0.15] },
    RightShoulder: { dir: [-0.98, -0.10, 0.15] },
    RightArm: { dir: [-0.14, -0.98, 0.10] },
    RightForeArm: { dir: [-0.10, -0.99, 0.06] },
    LeftArm: { dir: [0.14, -0.98, 0.10] },
    LeftForeArm: { dir: [0.10, -0.99, 0.06] },
    RightUpLeg: { dir: [-0.05, -0.99, 0.09] },
    RightLeg: { dir: [-0.04, -0.99, 0.04] },
    LeftUpLeg: { dir: [0.05, -0.99, 0.09] },
    LeftLeg: { dir: [0.04, -0.99, 0.04] },
    neck: { dir: [0, 0.72, 0.69], w: 0.95 },      // head lolls onto the chest
    Head: { dir: [0, 0.52, 0.85], w: 0.95 },
  },
};

export const VICTIM_BONE_WEIGHT = { Spine: 0.6, Spine01: 0.8, Spine02: 0.85, neck: 0.8, Head: 0.8 };
