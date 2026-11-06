import React from 'react';
import { interpolate, Easing } from 'remotion';
import { tokenize } from '../editor/highlight';
import { COLORS, FONT_FAMILY, withAlpha } from '../editor/theme';
import { Cursor } from '../editor/Cursor';
import { cursorOn } from '../effects/CursorBlink';
import { aberrationShadow } from '../effects/ChromaticAberration';
import type { SceneProps } from './types';
import { sway, useSceneClock } from './shared';

const ease = Easing.inOut(Easing.sin);

/** Code receding as a road toward a sun. */
export const SunsetScene: React.FC<SceneProps<'sunset'>> = ({ scene, storyboard, timing }) => {
  const { frame, fps, width, height, progress, t } = useSceneClock(timing);
  const p = interpolate(progress, [0, 1], [0, 1], { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cam = scene.camera;
  const zoom = cam.zoomFrom + (cam.zoomTo - cam.zoomFrom) * p;
  const scale = 0.95 + ((zoom - 1) / 3.5) * 0.6;
  const panY = (cam.panFrom.y + (cam.panTo.y - cam.panFrom.y) * p) * 220;
  const warm = storyboard.palette.warm;
  const accent = storyboard.palette.accent;
  const s = sway(t, storyboard.seed, 0.6);

  const sunY = height * (0.05 + scene.sunY * 0.3);
  const sunR = 84;
  const pulse = 1 + Math.sin(t * 0.9) * 0.03;

  const fontSize = 50;
  const lineH = fontSize * 1.45;
  const travel = (t * 16) % lineH; // slow forward drive
  const focusIndex = Math.floor(scene.code.length * 0.68);
  const shadow = aberrationShadow(scene.effects.aberration, 1);

  const road = (sharp: boolean) => (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: height * 0.1,
        width,
        height: height * 0.9,
        perspective: '1500px',
        perspectiveOrigin: '50% -25%',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          width: width * 0.56,
          transform: `translateX(-46%) rotateX(54deg) rotateZ(-6deg) translateY(${travel}px)`,
          transformOrigin: '50% 0%',
          fontFamily: FONT_FAMILY,
          fontSize,
          lineHeight: `${lineH}px`,
          whiteSpace: 'pre',
          textShadow: sharp ? shadow : undefined,
        }}
      >
        {scene.code.map((line, i) => {
          const isFocus = sharp && i === focusIndex;
          return (
            <div key={i} style={{ display: 'flex', opacity: isFocus ? 1 : 0.8 }}>
              <span style={{ width: fontSize * 1.4, color: COLORS.gutter, fontSize: fontSize * 0.55, textAlign: 'right', paddingRight: fontSize * 0.5 }}>{i + 7}</span>
              {tokenize(line).map((tk, k) => (
                <span key={k} style={{ color: tk.kind === 'call' ? COLORS.call : tk.kind === 'comment' ? COLORS.textDim : tk.kind === 'keyword' ? accent : COLORS.text }}>
                  {tk.text}
                </span>
              ))}
              {isFocus ? <Cursor color={accent} on={cursorOn(frame, fps, false)} em={0.95} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );

  const focusBand = `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 50%, #000 58%, #000 72%, rgba(0,0,0,0) 84%)`;
  const nearBand = `linear-gradient(180deg, #000 0%, #000 48%, rgba(0,0,0,0) 60%, rgba(0,0,0,0) 72%, #000 86%)`;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', transform: `rotate(${cam.tiltDeg}deg) translate(${s.x}px, ${panY + s.y}px) scale(${scale})`, transformOrigin: '50% 40%' }}>
      {/* sky haze */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${withAlpha('#ff4a14', 0.8 * scene.haze)} 0%, ${withAlpha('#d9381a', 0.55 * scene.haze)} 12%, ${withAlpha('#7a1c0b', 0.4 * scene.haze)} 26%, ${withAlpha('#2a0a04', 0.3 * scene.haze)} 40%, rgba(0,0,0,0) 52%)` }} />
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 110% 40% at 50% 6%, ${withAlpha('#ff8a3a', 0.45 * scene.haze)} 0%, rgba(0,0,0,0) 70%)` }} />
      {/* sun glow */}
      <div style={{ position: 'absolute', left: width / 2 - 420, top: sunY - 420, width: 840, height: 840, borderRadius: '50%', background: `radial-gradient(circle, ${withAlpha('#ffb15c', 0.75)} 0%, ${withAlpha(warm, 0.3)} 28%, rgba(0,0,0,0) 62%)`, transform: `scale(${pulse})` }} />
      <div style={{ position: 'absolute', left: width / 2 - sunR, top: sunY - sunR, width: sunR * 2, height: sunR * 2, borderRadius: '50%', background: `radial-gradient(circle at 45% 40%, #fff2c8 0%, #ffcf6a 35%, ${warm} 75%, #ff5a1f 100%)`, boxShadow: `0 0 60px ${withAlpha('#ffb15c', 0.8)}, 0 0 160px ${withAlpha(warm, 0.5)}`, transform: `scale(${pulse})` }} />
      {/* far, defocused road */}
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(9px)', WebkitMaskImage: nearBand, maskImage: nearBand }}>{road(false)}</div>
      {/* in-focus band */}
      <div style={{ position: 'absolute', inset: 0, WebkitMaskImage: focusBand, maskImage: focusBand }}>{road(true)}</div>
      {/* horizon fog on the road */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(0,0,0,0) 0%, ${withAlpha('#2a1409', 0.5)} 18%, rgba(0,0,0,0) 40%)` }} />
    </div>
  );
};
