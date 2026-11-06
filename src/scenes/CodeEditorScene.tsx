import React from 'react';
import { CameraRig } from '../effects/CameraRig';
import { BlurLayer, focusBlurPx } from '../effects/DepthOfField';
import { cursorOn } from '../effects/CursorBlink';
import { CodeEditor } from '../editor/CodeEditor';
import { EDITOR } from '../editor/theme';
import { typedCount } from '../schema/timeline';
import type { SceneProps } from './types';
import { editorCamera, sway, useSceneClock } from './shared';

export const CodeEditorScene: React.FC<SceneProps<'codeEditor'>> = ({ scene, storyboard, timing }) => {
  const { frame, fps, width, height, progress, t } = useSceneClock(timing);
  const state = editorCamera(scene.camera, progress);
  const typed = typedCount(timing.typing, frame);
  const typingActive = timing.typing !== null && typed > 0 && typed < timing.typing.text.length;
  const blur = focusBlurPx(state.focus, 14);
  const accent = storyboard.palette.accent;

  // A distant, defocused duplicate of the editor gives parallax depth behind the focus plane.
  const far = { ...state, zoom: state.zoom * 0.62, px: state.px * 0.9 + 300, py: state.py * 0.9 + 420, tilt: state.tilt * 0.8 };

  return (
    <>
      <BlurLayer blurPx={12} opacity={0.4}>
        <CameraRig state={far} contentWidth={EDITOR.width} contentHeight={EDITOR.height} viewportWidth={width} viewportHeight={height}>
          <CodeEditor filename={scene.filename} code={scene.code} accent={accent} cursorOn={false} chrome={false} opacity={0.85} startLine={11} />
        </CameraRig>
      </BlurLayer>
      <BlurLayer blurPx={blur}>
        <CameraRig state={state} contentWidth={EDITOR.width} contentHeight={EDITOR.height} viewportWidth={width} viewportHeight={height} sway={sway(t, storyboard.seed)}>
          <CodeEditor
            filename={scene.filename}
            code={scene.code}
            accent={accent}
            typingLine={scene.typingLine ?? null}
            typedCount={typed}
            cursorOn={cursorOn(frame, fps, typingActive)}
            warning={scene.warning}
            autocomplete={typed > 0 || !timing.typing ? scene.autocomplete : null}
            aberration={scene.effects.aberration}
          />
        </CameraRig>
      </BlurLayer>
    </>
  );
};
