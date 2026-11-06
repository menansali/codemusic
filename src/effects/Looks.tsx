import React from 'react';
import { random } from 'remotion';
import { FONT_FAMILY } from '../editor/theme';

/** VHS: scanlines, chroma bleed bands, tracking noise at the bottom, play OSD. */
export const VhsLook: React.FC<{ frame: number; fps: number; width: number; height: number; songTime: number }> = ({ frame, fps, width, height, songTime }) => {
  const trackY = (frame * 9) % (height + 200) - 100;
  const t = songTime + frame / fps;
  const osd = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px)', mixBlendMode: 'multiply' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: trackY, height: 70, background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0) 100%)', mixBlendMode: 'screen' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 26, opacity: 0.5, background: `repeating-linear-gradient(90deg, rgba(255,255,255,${0.1 + random(`vhs-${frame}`) * 0.2}) 0px, rgba(0,0,0,0) ${3 + Math.floor(random(`vhs2-${frame}`) * 9)}px)` }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, rgba(255,190,120,0.06) 0%, rgba(0,0,0,0) 60%)', mixBlendMode: 'screen' }} />
      <div style={{ position: 'absolute', left: 56, top: 120, fontFamily: FONT_FAMILY, fontSize: 40, color: '#f3e6cf', textShadow: '3px 0 rgba(255,0,60,0.6), -3px 0 rgba(0,200,255,0.6)', opacity: 0.85 }}>{'PLAY ▶'}</div>
      <div style={{ position: 'absolute', right: 56, top: 120, fontFamily: FONT_FAMILY, fontSize: 40, color: '#f3e6cf', textShadow: '3px 0 rgba(255,0,60,0.6), -3px 0 rgba(0,200,255,0.6)', opacity: 0.85 }}>{osd}</div>
      <div style={{ position: 'absolute', inset: 0, width, height, boxShadow: 'inset 0 0 220px rgba(0,0,0,0.75)' }} />
    </div>
  );
};

/** CRT: dense scanlines, phosphor glow and screen curvature shading. */
export const CrtLook: React.FC<{ frame: number; width: number; height: number; color: string }> = ({ frame, width, height, color }) => (
  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 4px)' }} />
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${color}14 0%, rgba(0,0,0,0) 65%)`, mixBlendMode: 'screen', opacity: 0.85 + 0.15 * Math.sin(frame * 0.9) }} />
    <div style={{ position: 'absolute', inset: 0, width, height, borderRadius: 60, boxShadow: 'inset 0 0 160px 40px rgba(0,0,0,0.85)' }} />
  </div>
);

/** Glitch bars: displaced coloured slices for a few frames. amount 0..1. */
export const GlitchBars: React.FC<{ amount: number; frame: number; seed: number; width: number; height: number }> = ({ amount, frame, seed, width, height }) => {
  if (amount <= 0.02) return null;
  const bars = Array.from({ length: 7 }, (_, i) => ({
    y: random(`${seed}-g-y-${frame}-${i}`) * height,
    h: 6 + random(`${seed}-g-h-${frame}-${i}`) * 60,
    x: (random(`${seed}-g-x-${frame}-${i}`) - 0.5) * 160 * amount,
    c: i % 3 === 0 ? 'rgba(255,0,90,0.35)' : i % 3 === 1 ? 'rgba(0,255,240,0.3)' : 'rgba(255,255,255,0.18)',
  }));
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen' }}>
      {bars.map((b, i) => (
        <div key={i} style={{ position: 'absolute', left: b.x, top: b.y, width: width * (0.4 + random(`${seed}-g-w-${frame}-${i}`) * 0.6), height: b.h, background: b.c, opacity: amount }} />
      ))}
    </div>
  );
};
