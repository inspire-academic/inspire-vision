import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile } from 'remotion';
import { palette } from '../primitives/palette';
import { frauncesFamily, jakartaFamily } from '../primitives/fonts';

/**
 * 0:28–0:30 — deliberately simple and quiet: the real shield, the Inspire
 * Vision name, the three-line promise, then the URL settles below. Given
 * more breathing room than the prototype — no music swell here, that
 * already happened in Scene 6.
 */
const LINES = ['REFORMING MINDS.', 'RENEWING HEARTS.', 'REBUILDING NATIONS.'];

export const Scene7_Lockup: React.FC<{
  localFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
}> = ({ localFrame }) => {
  const shieldOpacity = interpolate(localFrame, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const wordmarkOpacity = interpolate(localFrame, [8, 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const urlOpacity = interpolate(localFrame, [46, 58], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: palette.navy,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
      }}
    >
      <div style={{ opacity: shieldOpacity }}>
        <Img src={staticFile('images/shield.png')} style={{ width: 96, height: 'auto', display: 'block' }} />
      </div>
      <div
        style={{
          fontFamily: frauncesFamily,
          fontStyle: 'italic',
          fontWeight: 500,
          fontSize: 46,
          letterSpacing: 1,
          color: palette.goldPale,
          opacity: wordmarkOpacity,
          marginTop: 20,
        }}
      >
        Inspire Vision
      </div>

      <div style={{ marginTop: 38, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        {LINES.map((line, i) => {
          const start = 20 + i * 9;
          const op = interpolate(localFrame, [start, start + 11], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <div
              key={line}
              style={{
                fontFamily: jakartaFamily,
                fontWeight: 600,
                fontSize: 20,
                letterSpacing: 2.2,
                color: palette.gold,
                opacity: op,
              }}
            >
              {line}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 30,
          fontFamily: jakartaFamily,
          fontWeight: 400,
          fontSize: 17,
          letterSpacing: 1,
          color: palette.goldPale,
          opacity: urlOpacity * 0.85,
        }}
      >
        inspirevision.org
      </div>
    </AbsoluteFill>
  );
};
