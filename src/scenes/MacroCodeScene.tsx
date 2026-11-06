import React from 'react';
import { interpolate, Easing } from 'remotion';
import { focusBlurPx } from '../effects/DepthOfField';
import { cursorOn } from '../effects/CursorBlink';
import { Cursor } from '../editor/Cursor';
import { tokenize } from '../editor/highlight';
import { COLORS, FONT_FAMILY } from '../editor/theme';
import { ChannelSplit, aberrationShadow } from '../effects/ChromaticAberration';
import { typedCount } from '../schema/timeline';
import type { SceneProps } from './types';
import { sway, useSceneClock } from './shared';

const ease = Easing.bezier(0.16, 1, 0.3, 1);

export const MacroCodeScene: React.FC<SceneProps<'macroCode'>> = ({ scene, storyboard, timing }) => {
  const { frame, fps, width, height, progress, t } = useSceneClock(timing);
  const p = interpolate(progress, [0, 1], [0, 1], { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cam = scene.camera;
  const zoom = cam.zoomFrom + (cam.zoomTo - cam.zoomFrom) * p;
  const scale = 0.86 + ((zoom - 1) / 3.5) * 0.42;
  const panX = (cam.panFrom.x + (cam.panTo.x - cam.panFrom.x) * p) * 160;
  const panY = (cam.panFrom.y + (cam.panTo.y - cam.panFrom.y) * p) * 160;
  const focus = cam.focusFrom + (cam.focusTo - cam.focusFrom) * p;
  const blur = focusBlurPx(focus, 16);
  const typed = typedCount(timing.typing, frame);
  const typing = timing.typing !== null && typed > 0 && typed < scene.token.length;
  const accent = storyboard.palette.accent;
  const s = sway(t, storyboard.seed, 1.4);

  const fontSize = Math.min(300, (width * 0.78) / Math.max(2, scene.token.length + 1) / 0.6);
  const tokens = tokenize(scene.token);
  const shadow = aberrationShadow(scene.effects.aberration * 0.5, fontSize / 64);

  const hero = (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT_FAMILY,
        fontSize,
        fontWeight: 700,
        whiteSpace: 'pre',
        lineHeight: 1,
      }}
    >
      <span style={{ position: 'absolute', left: width * 0.06, top: '50%', transform: 'translateY(-50%)', fontSize: fontSize * 0.26, color: COLORS.gutter, fontWeight: 400 }}>{scene.lineNumber}</span>
      <span style={{ display: 'inline-block', paddingLeft: width * 0.1 }}>
        {tokens.map((tk, i) => (
          <span key={i} style={{ color: tk.kind === 'keyword' || tk.kind === 'boolean' ? accent : tk.kind === 'call' ? COLORS.call : tk.kind === 'string' ? COLORS.string : COLORS.text, textShadow: shadow }}>
            {tk.text.slice(0, Math.max(0, typed - tokens.slice(0, i).reduce((a, x) => a + x.text.length, 0)))}
          </span>
        ))}
        <Cursor color={accent} on={cursorOn(frame, fps, typing)} em={0.9} />
      </span>
    </div>
  );

  return (
    <div style={{ position: 'absolute', inset: 0, transform: `rotate(${cam.tiltDeg}deg) translate(${panX + s.x}px, ${panY + s.y}px) scale(${scale})`, transformOrigin: '50% 50%' }}>
      {/* out-of-focus context lines above and below */}
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(13px)', opacity: 0.55, fontFamily: FONT_FAMILY, fontSize: fontSize * 0.42, color: COLORS.textDim, whiteSpace: 'pre', lineHeight: 1.6 }}>
        {scene.context.map((line, i) => (
          <div key={i} style={{ position: 'absolute', left: width * 0.16 - (i % 2) * 120, top: height * 0.5 + (i - (scene.context.length - 1) / 2) * fontSize * 1.25 - fontSize * 0.25 }}>
            {tokenize(line).map((tk, k) => (
              <span key={k} style={{ color: tk.kind === 'keyword' ? accent : tk.kind === 'call' ? COLORS.call : tk.kind === 'string' ? COLORS.string : tk.kind === 'comment' ? COLORS.comment : COLORS.textDim }}>
                {tk.text}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', inset: 0, filter: blur > 0.05 ? `blur(${blur}px)` : undefined }}>
        <ChannelSplit strength={scene.effects.aberration} width={width} height={height}>
          {hero}
        </ChannelSplit>
      </div>
    </div>
  );
};
