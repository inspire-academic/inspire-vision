import React from 'react';
import { Img, interpolate } from 'remotion';
import { palette } from './palette';

/** A slow push-in/pan on a still photograph — the "camera drift" the brief asks for. */
export const KenBurnsImage: React.FC<{
  src: string;
  progress: number; // 0-1 across this image's own visible window
  opacity?: number;
  scaleFrom?: number;
  scaleTo?: number;
  panXFrom?: number; // percent
  panXTo?: number;
  panYFrom?: number;
  panYTo?: number;
}> = ({
  src,
  progress,
  opacity = 1,
  scaleFrom = 1,
  scaleTo = 1.08,
  panXFrom = 0,
  panXTo = 0,
  panYFrom = 0,
  panYTo = 0,
}) => {
  const scale = scaleFrom + (scaleTo - scaleFrom) * progress;
  const panX = panXFrom + (panXTo - panXFrom) * progress;
  const panY = panYFrom + (panYTo - panYFrom) * progress;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity }}>
      <Img
        src={src}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale}) translate(${panX}%, ${panY}%)`,
          transformOrigin: 'center center',
        }}
      />
    </div>
  );
};

/** Soft edge darkening so photography reads as part of the same navy world, not a pasted rectangle. */
export const CinematicVignette: React.FC<{ strength?: number }> = ({ strength = 0.5 }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: `radial-gradient(ellipse at center, rgba(10,22,40,0) 38%, rgba(10,22,40,${strength}) 100%)`,
      pointerEvents: 'none',
    }}
  />
);

/** Fade-in / hold / fade-out window for one layer in a crossfade sequence, plus its own 0-1 progress. */
export function crossfadeLayer(localFrame: number, start: number, end: number, overlap: number) {
  const progress = interpolate(localFrame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = interpolate(
    localFrame,
    [start, start + overlap, end - overlap, end],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  return { progress, opacity };
}

export const sceneBackground = { backgroundColor: palette.navy } as const;
