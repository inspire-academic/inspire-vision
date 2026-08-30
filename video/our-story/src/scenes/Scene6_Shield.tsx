import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile } from 'remotion';
import { palette, CARDINALS } from '../primitives/palette';
import { sceneBackground } from '../primitives/CinematicImage';

/**
 * 0:24–0:28 — the emotional and musical climax. The four gold strands
 * converge; the REAL supplied shield asset (public/images/shield.png, keyed
 * from the reference photo — pixels unaltered) is revealed underneath via a
 * glow/opacity build, not a redraw and not an abrupt cut. It should feel
 * discovered through the convergence.
 */
export const Scene6_Shield: React.FC<{
  localFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
}> = ({ localFrame, durationInFrames, width, height }) => {
  const cx = width * 0.5;
  const cy = height * 0.46;

  const converge = interpolate(localFrame, [0, 55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const shieldReveal = interpolate(localFrame, [30, durationInFrames - 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const shieldScale = interpolate(localFrame, [30, durationInFrames - 8], [0.88, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const glowPulse = interpolate(localFrame, [30, 60, durationInFrames], [0, 0.5, 0.25], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={sceneBackground}>
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        {CARDINALS.map((c) => {
          const rad = (c.angle * Math.PI) / 180;
          const startRadius = height * 0.34 * (1 - 0.4 * 0.6); // matches Scene5's end state
          const radius = startRadius * (1 - converge);
          const x = cx + radius * Math.cos(rad);
          const y = cy + radius * Math.sin(rad);
          return (
            <line
              key={c.name}
              x1={x}
              y1={y}
              x2={cx}
              y2={cy}
              stroke={palette.goldBright}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={1 - shieldReveal * 0.7}
            />
          );
        })}
      </svg>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            position: 'absolute',
            width: 460,
            height: 460,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${palette.gold}55 0%, transparent 70%)`,
            opacity: glowPulse,
          }}
        />
        <div
          style={{
            opacity: shieldReveal,
            transform: `scale(${shieldScale})`,
            filter: `drop-shadow(0 0 ${24 * shieldReveal}px ${palette.gold}88)`,
          }}
        >
          <Img src={staticFile('images/shield.png')} style={{ width: 300, height: 'auto', display: 'block' }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
