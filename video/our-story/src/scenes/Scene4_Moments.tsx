import React from 'react';
import { AbsoluteFill, interpolate, staticFile } from 'remotion';
import { palette } from '../primitives/palette';
import { KenBurnsImage, CinematicVignette, crossfadeLayer, sceneBackground } from '../primitives/CinematicImage';

/**
 * 0:13–0:19 — the emotional centre of the film. One continuous cinematic
 * journey through three real human moments (mentorship, wellbeing, faith)
 * via slow push/pan and crossfade — no boxes, no carousel, no icon circles.
 * Each moment carries its own motion character: mentorship is lateral and
 * relational, wellbeing settles into a broader, restorative frame, faith
 * holds still and contemplative. The travelling gold light is mostly the
 * photography's own baked-in thread — the added light-sweep between shots
 * stays deliberately faint so it never reads as a pasted-on effect.
 */
const LAYERS = [
  { src: 'images/scene4-mentorship.png', start: 0, end: 80 },
  { src: 'images/scene4-wellbeing.png', start: 58, end: 140 },
  { src: 'images/scene4-faith.png', start: 118, end: 180 },
] as const;
const OVERLAP = 22;

export const Scene4_Moments: React.FC<{
  localFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
}> = ({ localFrame }) => {
  return (
    <AbsoluteFill style={sceneBackground}>
      {LAYERS.map((layer, i) => {
        const { progress, opacity } = crossfadeLayer(localFrame, layer.start, layer.end, OVERLAP);
        if (opacity <= 0) return null;

        const motion =
          i === 0
            ? { scaleFrom: 1.05, scaleTo: 1.1, panXFrom: -2, panXTo: 2, panYFrom: 0, panYTo: 0 }
            : i === 1
              ? { scaleFrom: 1.08, scaleTo: 1.02, panXFrom: 0, panXTo: 0, panYFrom: -0.5, panYTo: 0.5 }
              : { scaleFrom: 1.02, scaleTo: 1.06, panXFrom: 0, panXTo: 0, panYFrom: 0.3, panYTo: -0.3 };

        return (
          <KenBurnsImage
            key={layer.src}
            src={staticFile(layer.src)}
            progress={progress}
            opacity={opacity}
            {...motion}
          />
        );
      })}

      {/* A faint gold sweep during each handoff — the thread passing from one moment to the next. */}
      {LAYERS.slice(0, -1).map((layer, i) => {
        const next = LAYERS[i + 1];
        const sweepCenter = next.start + OVERLAP / 2;
        const sweepOpacity = interpolate(
          localFrame,
          [sweepCenter - OVERLAP, sweepCenter, sweepCenter + OVERLAP],
          [0, 0.16, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        return (
          <div
            key={layer.src}
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(100deg, transparent 30%, ${palette.goldLight} 50%, transparent 70%)`,
              opacity: sweepOpacity,
              mixBlendMode: 'screen',
            }}
          />
        );
      })}

      <CinematicVignette strength={0.46} />
    </AbsoluteFill>
  );
};
