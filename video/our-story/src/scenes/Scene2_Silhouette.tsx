import React from 'react';
import { AbsoluteFill, interpolate, staticFile } from 'remotion';
import { KenBurnsImage, CinematicVignette, sceneBackground } from '../primitives/CinematicImage';

/**
 * 0:04–0:09 — the point moves; the film settles on one real young person,
 * becoming more than academic performance. A slow cinematic push-in on the
 * supplied whole-person still carries this scene — no bust-outline diagram,
 * no mind/heart/body/spirit labels. The idea is felt, not diagrammed.
 */
export const Scene2_Silhouette: React.FC<{
  localFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
}> = ({ localFrame, durationInFrames }) => {
  const progress = interpolate(localFrame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const revealOpacity = interpolate(localFrame, [0, 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={sceneBackground}>
      <div style={{ opacity: revealOpacity }}>
        <KenBurnsImage
          src={staticFile('images/scene2-whole-person.png')}
          progress={progress}
          scaleFrom={1.03}
          scaleTo={1.14}
          panXFrom={0}
          panXTo={-1.5}
          panYFrom={0.5}
          panYTo={-0.5}
        />
      </div>
      <CinematicVignette strength={0.42} />
    </AbsoluteFill>
  );
};
