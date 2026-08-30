import { registerRoot, Composition } from 'remotion';
import React from 'react';
import { OurStory } from './OurStory';
import { FPS, DURATION_IN_FRAMES, WIDTH, HEIGHT } from './primitives/palette';

const Root: React.FC = () => {
  return React.createElement(Composition, {
    id: 'OurStory',
    component: OurStory,
    durationInFrames: DURATION_IN_FRAMES,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
  });
};

registerRoot(Root);
