import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';
import { SCENES } from '../primitives/palette';
import { VO_READY } from './voStatus';

const SCENE_KEYS = Object.keys(SCENES) as (keyof typeof SCENES)[];

/**
 * One <Audio> per scene, gated on VO_READY (see voStatus.ts). Each clip
 * starts at its scene's frame 0 — every VO line is shorter than its window,
 * so no further alignment is needed.
 */
export const VoiceoverTrack: React.FC = () => {
  if (!VO_READY) return null;

  return (
    <>
      {SCENE_KEYS.map((key, i) => {
        const { start, end } = SCENES[key];
        return (
          <Sequence key={key} from={start} durationInFrames={end - start}>
            <Audio src={staticFile(`vo/scene${i + 1}.mp3`)} />
          </Sequence>
        );
      })}
    </>
  );
};
