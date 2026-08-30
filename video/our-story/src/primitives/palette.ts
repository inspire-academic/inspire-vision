export const palette = {
  navy: '#0A1628',
  gold: '#C9971C',
  goldBright: '#E0AA22',
  goldLight: '#F0C842',
  goldPale: '#FDF6DC',
} as const;

export const FPS = 30;
export const DURATION_IN_FRAMES = 900;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// Scene boundaries in frames, matching the brief's timecodes exactly.
export const SCENES = {
  scene1: { start: 0, end: 120 }, // 0:00–0:04
  scene2: { start: 120, end: 270 }, // 0:04–0:09
  scene3: { start: 270, end: 390 }, // 0:09–0:13
  scene4: { start: 390, end: 570 }, // 0:13–0:19
  scene5: { start: 570, end: 720 }, // 0:19–0:24
  scene6: { start: 720, end: 840 }, // 0:24–0:28
  scene7: { start: 840, end: 900 }, // 0:28–0:30
} as const;

export const CARDINALS = [
  { name: 'Academic', angle: -135 },
  { name: 'Mentorship & Formation', angle: -45 },
  { name: 'Health & Wellbeing', angle: 45 },
  { name: 'Faith & Spiritual Formation', angle: 135 },
] as const;
