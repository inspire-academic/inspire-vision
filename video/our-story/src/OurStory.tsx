import React from 'react';
import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig } from 'remotion';
import { GoldLight, PathKeyframe } from './primitives/GoldLight';
import { palette, SCENES } from './primitives/palette';
import { Scene1_Point } from './scenes/Scene1_Point';
import { Scene2_Silhouette } from './scenes/Scene2_Silhouette';
import { Scene3_FourStrands } from './scenes/Scene3_FourStrands';
import { Scene4_Moments } from './scenes/Scene4_Moments';
import { Scene5_Ripple } from './scenes/Scene5_Ripple';
import { Scene6_Shield } from './scenes/Scene6_Shield';
import { Scene7_Lockup } from './scenes/Scene7_Lockup';
import { VoiceoverTrack } from './audio/VoiceoverTrack';
import { MusicBed } from './audio/MusicBed';

// The gold light's path across the WHOLE 900-frame timeline, driven by the
// absolute frame — this is what keeps it reading as one continuous element
// through every scene boundary instead of a series of hard cuts.
const LIGHT_PATH: PathKeyframe[] = [
  { frame: 0, x: 0.5, y: 0.5, scale: 0.3, opacity: 0 },
  { frame: 20, x: 0.5, y: 0.5, scale: 0.6, opacity: 1 },
  { frame: 118, x: 0.5, y: 0.46, scale: 0.55, opacity: 1 },
  { frame: 150, x: 0.5, y: 0.46, scale: 0.5, opacity: 0.9 },
  { frame: 270, x: 0.5, y: 0.46, scale: 0.7, opacity: 0.8 },
  { frame: 320, x: 0.5, y: 0.46, scale: 0.4, opacity: 0.35 },
  { frame: 390, x: 0.5, y: 0.46, scale: 0.3, opacity: 0.25 },
  { frame: 570, x: 0.5, y: 0.46, scale: 0.3, opacity: 0.2 },
  { frame: 700, x: 0.5, y: 0.46, scale: 0.35, opacity: 0.4 },
  { frame: 720, x: 0.5, y: 0.46, scale: 0.45, opacity: 0.6 },
  { frame: 770, x: 0.5, y: 0.46, scale: 0.9, opacity: 0.9 },
  { frame: 820, x: 0.5, y: 0.46, scale: 0.2, opacity: 0 },
  { frame: 900, x: 0.5, y: 0.46, scale: 0.2, opacity: 0 },
];

/** Calls useCurrentFrame() inside a <Series.Sequence> and forwards it down. */
const SceneFrame: React.FC<{ children: (localFrame: number) => React.ReactNode }> = ({
  children,
}) => {
  const localFrame = useCurrentFrame();
  return <>{children(localFrame)}</>;
};

export const OurStory: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: palette.navy }}>
      <Series>
        <Series.Sequence durationInFrames={SCENES.scene1.end - SCENES.scene1.start}>
          <SceneFrame>
            {(lf) => (
              <Scene1_Point
                localFrame={lf}
                durationInFrames={SCENES.scene1.end - SCENES.scene1.start}
              />
            )}
          </SceneFrame>
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES.scene2.end - SCENES.scene2.start}>
          <SceneFrame>
            {(lf) => (
              <Scene2_Silhouette
                localFrame={lf}
                durationInFrames={SCENES.scene2.end - SCENES.scene2.start}
                width={width}
                height={height}
              />
            )}
          </SceneFrame>
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES.scene3.end - SCENES.scene3.start}>
          <SceneFrame>
            {(lf) => (
              <Scene3_FourStrands
                localFrame={lf}
                durationInFrames={SCENES.scene3.end - SCENES.scene3.start}
                width={width}
                height={height}
              />
            )}
          </SceneFrame>
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES.scene4.end - SCENES.scene4.start}>
          <SceneFrame>
            {(lf) => (
              <Scene4_Moments
                localFrame={lf}
                durationInFrames={SCENES.scene4.end - SCENES.scene4.start}
                width={width}
                height={height}
              />
            )}
          </SceneFrame>
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES.scene5.end - SCENES.scene5.start}>
          <SceneFrame>
            {(lf) => (
              <Scene5_Ripple
                localFrame={lf}
                durationInFrames={SCENES.scene5.end - SCENES.scene5.start}
                width={width}
                height={height}
              />
            )}
          </SceneFrame>
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES.scene6.end - SCENES.scene6.start}>
          <SceneFrame>
            {(lf) => (
              <Scene6_Shield
                localFrame={lf}
                durationInFrames={SCENES.scene6.end - SCENES.scene6.start}
                width={width}
                height={height}
              />
            )}
          </SceneFrame>
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENES.scene7.end - SCENES.scene7.start}>
          <SceneFrame>
            {(lf) => (
              <Scene7_Lockup
                localFrame={lf}
                durationInFrames={SCENES.scene7.end - SCENES.scene7.start}
                width={width}
                height={height}
              />
            )}
          </SceneFrame>
        </Series.Sequence>
      </Series>

      <GoldLight frame={frame} keyframes={LIGHT_PATH} width={width} height={height} />

      <VoiceoverTrack />
      <MusicBed />
    </AbsoluteFill>
  );
};
