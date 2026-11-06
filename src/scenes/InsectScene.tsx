import React from 'react';
import { interpolate, Easing } from 'remotion';
import { CameraRig } from '../effects/CameraRig';
import { BlurLayer, focusBlurPx } from '../effects/DepthOfField';
import { cursorOn } from '../effects/CursorBlink';
import { CodeEditor } from '../editor/CodeEditor';
import { EDITOR } from '../editor/theme';
import { Beetle } from '../composition/Beetle';
import { rng } from '../lib/seed';
import type { SceneProps } from './types';
import { editorCamera, sway, useSceneClock } from './shared';

export const InsectScene: React.FC<SceneProps<'insect'>> = ({ scene, storyboard, timing }) => {
  const { frame, fps, width, height, progress, t } = useSceneClock(timing);
  const state = editorCamera(scene.camera, progress);
  const r = rng(storyboard.seed, `insect-${timing.index}`);
  const wobble = r();
  const startSide = r();

  // Path in viewport space; the beetle walks with a slight meander.
  const p = interpolate(progress, [0, 1], [0, 1], { easing: Easing.inOut(Easing.quad), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const meander = Math.sin(p * Math.PI * 2.5 + wobble * 6) * 90;
  let x: number;
  let y: number;
  let heading: number;
  switch (scene.path) {
    case 'leftToRight':
      x = -260 + p * (width + 520);
      y = height * (0.32 + startSide * 0.25) + meander;
      heading = 90 + Math.cos(p * Math.PI * 2.5 + wobble * 6) * 10;
      break;
    case 'diagonal':
      x = -240 + p * (width + 480);
      y = height * 0.08 + p * height * 0.62 + meander * 0.6;
      heading = 140 + Math.cos(p * Math.PI * 2.5) * 8;
      break;
    default:
      x = width * (0.38 + startSide * 0.3) + meander;
      y = -300 + p * (height * 0.9 + 300);
      heading = 180 + Math.cos(p * Math.PI * 2.5 + wobble * 6) * 12;
  }
  const size = 400 + wobble * 90;
  const walkPhase = t * 9;
  const blur = focusBlurPx(state.focus, 12);

  return (
    <>
      <BlurLayer blurPx={blur}>
        <CameraRig state={state} contentWidth={EDITOR.width} contentHeight={EDITOR.height} viewportWidth={width} viewportHeight={height} sway={sway(t, storyboard.seed, 0.8)}>
          <CodeEditor filename="" code={scene.code} accent={storyboard.palette.accent} cursorOn={cursorOn(frame, fps, false)} chrome={false} aberration={scene.effects.aberration} startLine={3} />
        </CameraRig>
      </BlurLayer>
      <div style={{ position: 'absolute', inset: 0, filter: `blur(${Math.max(0, 1.2 - state.focus) * 2}px)` }}>
        <Beetle x={x} y={y} size={size} heading={heading} walkPhase={walkPhase} />
      </div>
    </>
  );
};
