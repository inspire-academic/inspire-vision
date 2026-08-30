import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { palette } from '../primitives/palette';

/**
 * 0:00–0:04 — the darkness should feel rich and expensive, not empty:
 * faint radial depth, barely-visible dust particles, and a microscopic
 * camera drift toward the point of light rendered by the persistent
 * <GoldLight>. Latent possibility, not a blank screen.
 */
const PARTICLE_COUNT = 22;
const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  // Deterministic pseudo-random layout (no Math.random — must render
  // identically on every frame worker during a parallel render).
  const seed = i * 137.51;
  return {
    x: ((seed * 13) % 100) / 100,
    y: ((seed * 29) % 100) / 100,
    phase: (seed % 628) / 100,
    speed: 0.6 + ((i * 7) % 5) / 10,
    size: 1 + ((i * 3) % 3),
  };
});

export const Scene1_Point: React.FC<{ localFrame: number; durationInFrames: number }> = ({
  localFrame,
  durationInFrames,
}) => {
  const fieldIn = interpolate(localFrame, [0, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // Camera drift so small it registers as presence rather than motion.
  const drift = interpolate(localFrame, [0, durationInFrames], [1, 1.012], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: palette.navy, opacity: 0.4 + 0.6 * fieldIn }}>
      <AbsoluteFill
        style={{
          transform: `scale(${drift})`,
          background:
            'radial-gradient(ellipse at 50% 46%, rgba(30,48,78,0.55) 0%, rgba(10,22,40,0) 55%)',
        }}
      />
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        {particles.map((p, i) => {
          const twinkle = 0.15 + 0.15 * Math.abs(Math.sin(localFrame * 0.02 * p.speed + p.phase));
          return (
            <circle
              key={i}
              cx={`${p.x * 100}%`}
              cy={`${p.y * 100}%`}
              r={p.size}
              fill={palette.goldPale}
              opacity={twinkle * fieldIn}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
