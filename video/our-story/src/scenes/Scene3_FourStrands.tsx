import React from 'react';
import { AbsoluteFill, interpolate, Easing } from 'remotion';
import { palette } from '../primitives/palette';

/**
 * 0:09–0:13 — the single light separates into four dimensions. Deliberately
 * NOT a symmetric X/pinwheel: each strand has its own angle, curve
 * character and pace so the shape itself never reads as a diagram. No text
 * labels — four full programme names on screen at once was exactly what
 * the brief warned against; the idea is felt through motion, not read.
 *
 *  - Academic:    precise, upward, structured — straighter, quicker draw
 *  - Mentorship:  relational, lateral — a pronounced S-curve reaching sideways
 *  - Health:      protective, broad arc — one wide restorative sweep
 *  - Faith:       upward, contemplative — gentle, slow, the stillest of the four
 */
const STRANDS = [
  { angle: -128, bulge: 0.22, sBend: false, speed: 1.15, delay: 0 }, // Academic
  { angle: -12, bulge: 0.42, sBend: true, speed: 1, delay: 10 }, // Mentorship
  { angle: 96, bulge: 0.5, sBend: false, speed: 0.85, delay: 20 }, // Health
  { angle: -76, bulge: 0.16, sBend: false, speed: 0.7, delay: 30 }, // Faith
] as const;

export const Scene3_FourStrands: React.FC<{
  localFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
}> = ({ localFrame, width, height }) => {
  const cx = width * 0.5;
  const cy = height * 0.46;
  const radius = height * 0.34;
  const pathLength = 900;
  const easing = Easing.bezier(0.22, 0.9, 0.3, 1);

  return (
    <AbsoluteFill style={{ backgroundColor: palette.navy }}>
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        <defs>
          <filter id="strandGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <radialGradient id="strandEndGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={palette.goldLight} stopOpacity="1" />
            <stop offset="100%" stopColor={palette.gold} stopOpacity="0" />
          </radialGradient>
        </defs>

        {STRANDS.map((s, i) => {
          const drawStart = 6 + s.delay;
          const drawEnd = drawStart + 60 / s.speed;
          const draw = interpolate(localFrame, [drawStart, drawEnd], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing,
          });
          const rad = (s.angle * Math.PI) / 180;
          const dirX = Math.cos(rad);
          const dirY = Math.sin(rad);
          const perpX = -dirY;
          const perpY = dirX;

          const endX = cx + radius * dirX;
          const endY = cy + radius * dirY;
          // sBend strands bulge one way then the other; the rest hold one
          // consistent bulge direction (a single restorative arc, or a
          // near-straight structured line when bulge is small).
          const bendSign = i % 2 === 0 ? 1 : -1;
          const c1X = cx + radius * 0.32 * dirX + radius * s.bulge * bendSign * perpX;
          const c1Y = cy + radius * 0.32 * dirY + radius * s.bulge * bendSign * perpY;
          const c2X = s.sBend
            ? cx + radius * 0.72 * dirX - radius * (s.bulge * 0.5) * bendSign * perpX
            : cx + radius * 0.72 * dirX + radius * (s.bulge * 0.6) * bendSign * perpX;
          const c2Y = s.sBend
            ? cy + radius * 0.72 * dirY - radius * (s.bulge * 0.5) * bendSign * perpY
            : cy + radius * 0.72 * dirY + radius * (s.bulge * 0.6) * bendSign * perpY;

          const d = `M ${cx} ${cy} C ${c1X} ${c1Y} ${c2X} ${c2Y} ${endX} ${endY}`;

          return (
            <g key={s.angle}>
              <path
                d={d}
                fill="none"
                stroke={palette.gold}
                strokeWidth={11}
                strokeLinecap="round"
                strokeDasharray={pathLength}
                strokeDashoffset={pathLength * (1 - draw)}
                opacity={0.4}
                filter="url(#strandGlow)"
              />
              <path
                d={d}
                fill="none"
                stroke={palette.goldBright}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray={pathLength}
                strokeDashoffset={pathLength * (1 - draw)}
              />
              <circle cx={endX} cy={endY} r={18} fill="url(#strandEndGlow)" opacity={draw} />
              <circle cx={endX} cy={endY} r={5} fill={palette.goldLight} opacity={draw} />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
