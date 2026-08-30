import React from 'react';
import { interpolate, Easing } from 'remotion';
import { palette } from './palette';

export type PathKeyframe = {
  frame: number;
  x: number; // 0-1, fraction of composition width
  y: number; // 0-1, fraction of composition height
  scale: number; // relative glow radius
  opacity: number;
};

/**
 * Piecewise-linear interpolation across an arbitrary keyframe path, driven by
 * the ABSOLUTE frame (never a per-scene local frame). This is what keeps the
 * light reading as one continuous element instead of a series of hard cuts.
 */
export function samplePath(frame: number, keyframes: PathKeyframe[]) {
  const inputRange = keyframes.map((k) => k.frame);
  const easing = Easing.bezier(0.33, 0, 0.2, 1);
  const x = interpolate(frame, inputRange, keyframes.map((k) => k.x), {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });
  const y = interpolate(frame, inputRange, keyframes.map((k) => k.y), {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });
  const scale = interpolate(frame, inputRange, keyframes.map((k) => k.scale), {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });
  const opacity = interpolate(frame, inputRange, keyframes.map((k) => k.opacity), {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return { x, y, scale, opacity };
}

/**
 * The single persistent gold light — the film's protagonist. Mounted once at
 * the composition root and driven by the absolute frame across all 900
 * frames, so its position/scale/opacity tween continuously through every
 * scene boundary instead of remounting per-Sequence.
 */
export const GoldLight: React.FC<{
  frame: number;
  keyframes: PathKeyframe[];
  width: number;
  height: number;
  baseRadius?: number;
}> = ({ frame, keyframes, width, height, baseRadius = 14 }) => {
  const { x, y, scale, opacity } = samplePath(frame, keyframes);
  const cx = x * width;
  const cy = y * height;
  const r = baseRadius * scale;

  const pulse = 1 + 0.06 * Math.sin(frame / 9);

  return (
    <svg
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0, opacity }}
    >
      <defs>
        <radialGradient id="goldGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={palette.goldLight} stopOpacity="1" />
          <stop offset="35%" stopColor={palette.gold} stopOpacity="0.9" />
          <stop offset="100%" stopColor={palette.gold} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r * 6 * pulse} fill="url(#goldGlow)" />
      <circle cx={cx} cy={cy} r={r * 0.6 * pulse} fill={palette.goldLight} />
    </svg>
  );
};
