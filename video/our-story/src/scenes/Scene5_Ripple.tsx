import React from 'react';
import { AbsoluteFill, staticFile } from 'remotion';
import { KenBurnsImage, CinematicVignette, crossfadeLayer, sceneBackground } from '../primitives/CinematicImage';

/**
 * 0:19–0:24 — person → family → community → generations. Scene 4 already
 * closed on one solitary figure (the faith moment), so this scene opens
 * already widening: family, then a fuller community gathering, then an
 * intergenerational moment handing something forward — three real
 * photographs, not a concentric-circle diagram. The widening is carried by
 * the images themselves (4 people → 7 → 6 across generations), reinforced
 * by a gentle pull-back in the camera across the sequence.
 */
const LAYERS = [
  { src: 'images/scene5-family.png', start: 0, end: 66 },
  { src: 'images/scene5-community.png', start: 48, end: 112 },
  { src: 'images/scene5-generations.png', start: 94, end: 150 },
] as const;
const OVERLAP = 20;

export const Scene5_Ripple: React.FC<{
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

        // A gentle pull-back across the sequence — family starts closest
        // (still intimate), generations settles widest (the fullest frame).
        const motion =
          i === 0
            ? { scaleFrom: 1.1, scaleTo: 1.04, panXFrom: 0.5, panXTo: -0.5, panYFrom: 0, panYTo: 0 }
            : i === 1
              ? { scaleFrom: 1.06, scaleTo: 1.0, panXFrom: -1, panXTo: 1, panYFrom: 0, panYTo: 0 }
              : { scaleFrom: 1.04, scaleTo: 1.0, panXFrom: 0, panXTo: 0, panYFrom: 0.4, panYTo: -0.2 };

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
      <CinematicVignette strength={0.44} />
    </AbsoluteFill>
  );
};
