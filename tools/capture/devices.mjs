// The capture matrix.
//
// SIZES are the CSS-pixel viewports iOS Safari actually reports for these
// phones in landscape (the long edge first), cross-checked against Playwright's
// own device registry where it carries the device.
//
// INSETS are the safe-area values env(safe-area-inset-*) resolves to on the real
// hardware. No headless browser reports them, so the harness injects them as the
// --sa-* custom properties css/main.css already reads. They are ASYMMETRIC on
// purpose: in landscape the notch or Dynamic Island sits on ONE side, and which
// side it is flips with the orientation. A HUD that clears it in landscape-left
// and hides under it in landscape-right is the single most commonly missed iOS
// landscape bug, and capturing both orientations is the only way to see it.
//
// The bottom inset is the home indicator: 21 pt on every notched iPhone. Nothing
// interactive may sit inside it — the OS eats the touch for its own swipe.
export const DEVICES = [
  {
    id: 'se3',
    name: 'iPhone SE (3rd gen)',
    landscape: { width: 667, height: 375 },
    portrait: { width: 375, height: 667 },
    dpr: 2,
    // no notch, no home indicator: the Touch ID generation reports zero insets
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
    notch: 0,
  },
  {
    id: 'ip14',
    name: 'iPhone 13 / 14',
    landscape: { width: 844, height: 390 },
    portrait: { width: 390, height: 844 },
    dpr: 3,
    insets: { left: 0, right: 0, top: 0, bottom: 21 },
    notch: 47,
  },
  {
    id: 'ip16pro',
    name: 'iPhone 14-16 Pro',
    landscape: { width: 852, height: 393 },
    portrait: { width: 393, height: 852 },
    dpr: 3,
    insets: { left: 0, right: 0, top: 0, bottom: 21 },
    notch: 59,
  },
  {
    id: 'ip16promax',
    name: 'iPhone 15-16 Pro Max',
    landscape: { width: 932, height: 430 },
    portrait: { width: 430, height: 932 },
    dpr: 3,
    insets: { left: 0, right: 0, top: 0, bottom: 21 },
    notch: 59,
  },
  {
    id: 'desktop',
    name: 'Desktop sanity check',
    landscape: { width: 1920, height: 1080 },
    portrait: { width: 1080, height: 1920 },
    dpr: 1,
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
    notch: 0,
  },
];

// Resolve the four insets for one device in one orientation.
//   landscape-left  — the phone rotated counter-clockwise: notch on the LEFT
//   landscape-right — rotated clockwise: notch on the RIGHT
//   portrait        — notch on top; the rotate overlay should be up anyway
export function insetsFor(device, orientation) {
  const i = { ...device.insets };
  if (orientation === 'landscape-left') i.left = device.notch;
  else if (orientation === 'landscape-right') i.right = device.notch;
  else if (orientation === 'portrait') {
    i.top = device.notch ? 47 : 0;
    i.left = 0; i.right = 0;
  }
  return i;
}

export function viewportFor(device, orientation) {
  return orientation === 'portrait' ? device.portrait : device.landscape;
}

export const ORIENTATIONS = ['landscape-left', 'landscape-right'];
