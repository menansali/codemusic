import React from 'react';
import { CameraRig } from '../effects/CameraRig';
import { BlurLayer } from '../effects/DepthOfField';
import { CodeEditor } from '../editor/CodeEditor';
import { EDITOR, withAlpha } from '../editor/theme';
import type { SceneProps } from './types';
import { editorCamera, sway, useSceneClock } from './shared';

/** A breather: the editor dissolved into bokeh, light leak and dust doing the work. */
export const AmbientScene: React.FC<SceneProps<'ambient'>> = ({ scene, storyboard, timing }) => {
  const { width, height, progress, t } = useSceneClock(timing);
  const state = editorCamera(scene.camera, progress);
  const blur = 6 + scene.blurAmount * 10 * (1 - state.focus * 0.5);
  const accent = storyboard.palette.accent;
  return (
    <>
      <BlurLayer blurPx={blur} opacity={0.9}>
        <CameraRig state={state} contentWidth={EDITOR.width} contentHeight={EDITOR.height} viewportWidth={width} viewportHeight={height} sway={sway(t, storyboard.seed, 2)}>
          <CodeEditor filename="" code={scene.code} accent={accent} cursorOn chrome={false} startLine={5} />
        </CameraRig>
      </BlurLayer>
      {/* soft glowing cursor bokeh */}
      <div style={{ position: 'absolute', left: width * 0.55 + Math.sin(t * 0.4) * 30, top: height * 0.48, width: 90, height: 150, background: accent, borderRadius: 10, filter: 'blur(26px)', opacity: 0.35 + 0.2 * Math.sin(t * 2.1) }} />
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 70% 40% at 50% 115%, ${withAlpha(storyboard.palette.warm, 0.35)} 0%, rgba(0,0,0,0) 70%)` }} />
    </>
  );
};
