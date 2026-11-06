import React from 'react';
import { Composition, Folder } from 'remotion';
import { Reel, type ReelProps } from './composition/Reel';
import { computeTimeline } from './schema/timeline';
import { normalize } from './generator/normalize';
import { fallbackStoryboard } from './generator/fallback';
import { VIDEO } from './lib/renderSettings';
import { SCENE_TYPES } from './schema/storyboard';

const preview = normalize(fallbackStoryboard('summer nostalgia'));


export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Reel"
        component={Reel}
        width={VIDEO.width}
        height={VIDEO.height}
        fps={VIDEO.fps}
        durationInFrames={VIDEO.fps * 30}
        defaultProps={{ storyboard: preview, audioDir: null } satisfies ReelProps}
        calculateMetadata={({ props }) => ({ durationInFrames: computeTimeline(props.storyboard, VIDEO.fps).totalFrames })}
      />
      <Folder name="Scenes">
        {SCENE_TYPES.map((type) => {
          const scene = preview.scenes.find((s) => s.type === type);
          if (!scene) return null;
          const single = { ...preview, scenes: [{ ...scene, durationSec: 5 }] };
          return (
            <Composition
              key={type}
              id={`Scene-${type}`}
              component={Reel}
              width={VIDEO.width}
              height={VIDEO.height}
              fps={VIDEO.fps}
              durationInFrames={VIDEO.fps * 5}
              defaultProps={{ storyboard: single, audioDir: null } satisfies ReelProps}
            />
          );
        })}
      </Folder>
    </>
  );
};
