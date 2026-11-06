import React from 'react';
import { interpolate, Easing } from 'remotion';
import { tokenize } from '../editor/highlight';
import { COLORS, FONT_FAMILY } from '../editor/theme';
import { Cursor } from '../editor/Cursor';
import { cursorOn } from '../effects/CursorBlink';
import { ChannelSplit, aberrationShadow } from '../effects/ChromaticAberration';
import { focusBlurPx } from '../effects/DepthOfField';
import { typedCount } from '../schema/timeline';
import type { SceneProps } from './types';
import { sway, useSceneClock } from './shared';

const ease = Easing.bezier(0.16, 1, 0.3, 1);

/** Split at the space closest to the middle when the line is long; keeps a leading comment marker together. */
function splitForDisplay(text: string): string[] {
  if (text.length <= 14) return [text];
  const mid = text.length / 2;
  let best = -1;
  for (let i = 3; i < text.length - 3; i++) {
    if (text[i] === ' ' && (best === -1 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  if (best === -1) return [text];
  return [text.slice(0, best), text.slice(best + 1)];
}

export const TypographyScene: React.FC<SceneProps<'typography'>> = ({ scene, storyboard, timing }) => {
  const { frame, fps, width, height, progress, t } = useSceneClock(timing);
  const p = interpolate(progress, [0, 1], [0, 1], { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cam = scene.camera;
  const zoom = cam.zoomFrom + (cam.zoomTo - cam.zoomFrom) * p;
  const scale = 0.9 + ((zoom - 1) / 3.5) * 0.5;
  const focus = cam.focusFrom + (cam.focusTo - cam.focusFrom) * p;
  const blur = focusBlurPx(focus, 10);
  const typed = typedCount(timing.typing, frame);
  const typing = timing.typing !== null && typed > 0 && typed < scene.text.length;
  const accent = storyboard.palette.accent;
  const s = sway(t, storyboard.seed, 1.2);

  // Never overflow: split at the most central space when long, then fit each line to 88% width.
  const lines = splitForDisplay(scene.text);
  const longest = Math.max(...lines.map((l) => l.length));
  const fontSize = Math.min(170, Math.floor((width * 0.88) / ((longest + 1) * 0.6)));
  const shadow = aberrationShadow(scene.effects.aberration * 0.6, fontSize / 64);
  let consumed = 0;

  const block = (
    <div style={{ position: 'absolute', left: 0, top: 0, width, height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_FAMILY, whiteSpace: 'pre' }}>
      <div style={{ fontSize, fontWeight: 700, lineHeight: 1.15, textAlign: 'left' }}>
        {lines.map((line, li) => {
          const lineStart = consumed;
          const tokens = tokenize(line);
          const isLast = li === lines.length - 1;
          const lineVisible = typed - lineStart;
          consumed += line.length + 1; // +1 for the swallowed space
          const showCursorHere = isLast || typed < consumed;
          if (lineVisible <= 0 && li > 0) return <div key={li} style={{ height: fontSize * 1.15 }} />;
          let local = 0;
          return (
            <div key={li}>
              {tokens.map((tk, i) => {
                const start = local;
                local += tk.text.length;
                const visible = tk.text.slice(0, Math.max(0, lineVisible - start));
                return (
                  <span key={i} style={{ color: tk.kind === 'keyword' || tk.kind === 'boolean' ? accent : tk.kind === 'call' ? COLORS.call : tk.kind === 'string' ? COLORS.string : tk.kind === 'comment' ? COLORS.comment : COLORS.text, textShadow: shadow }}>
                    {visible}
                  </span>
                );
              })}
              {showCursorHere && (isLast || lineVisible < line.length) ? <Cursor color={accent} on={cursorOn(frame, fps, typing)} em={0.95} /> : null}
            </div>
          );
        })}
      </div>
      {scene.sub ? (
        <div style={{ marginTop: fontSize * 0.5, fontSize: fontSize * 0.36, color: COLORS.comment, opacity: interpolate(progress, [0.55, 0.75], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>{scene.sub}</div>
      ) : null}
    </div>
  );

  return (
    <div style={{ position: 'absolute', inset: 0, transform: `rotate(${cam.tiltDeg}deg) translate(${s.x}px, ${s.y}px) scale(${scale})`, transformOrigin: '50% 50%', filter: blur > 0.05 ? `blur(${blur}px)` : undefined }}>
      <ChannelSplit strength={scene.effects.aberration} width={width} height={height}>
        {block}
      </ChannelSplit>
    </div>
  );
};
