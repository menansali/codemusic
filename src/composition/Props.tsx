import React from 'react';
import { Easing, interpolate } from 'remotion';
import { rng } from '../lib/seed';
import { withAlpha } from '../editor/theme';
import type { PropKind } from '../lyrics/lexicon';

export type LyricPropProps = { kind: PropKind; age: number; fps: number; width: number; height: number; x: number; y: number; seed: number; warm: string; accent: string; skyY?: number | null };

const fadeInOut = (age: number, fps: number, life: number) =>
  interpolate(age, [0, fps * 0.25, fps * (life - 0.6), fps * life], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** Small, procedural visual cues that appear when a lyric word is typed. Deterministic per seed. */
export const LyricProp: React.FC<LyricPropProps> = ({ kind, age, fps, width, height, x, y, seed, warm, accent, skyY = null }) => {
  if (age < 0) return null;
  const r = rng(seed, `prop-${kind}`);
  const t = age / fps;
  const life = kind === 'rain' || kind === 'smoke' || kind === 'fire' ? 3.4 : 2.6;
  const a = fadeInOut(age, fps, life);
  if (a <= 0) return null;
  const s = { position: 'absolute' as const, inset: 0, pointerEvents: 'none' as const, opacity: a };

  switch (kind) {
    case 'rain': {
      const drops = Array.from({ length: 70 }, (_, i) => ({ x: r() * width, y: r() * height, l: 40 + r() * 70, sp: 900 + r() * 500, o: 0.25 + r() * 0.5, ph: r() }));
      return (
        <svg width={width} height={height} style={s}>
          <g stroke="#dfe8ff" strokeWidth="2.2" strokeLinecap="round">
            {drops.map((d, i) => {
              const yy = ((d.y + t * d.sp) % (height + 200)) - 100;
              return <line key={i} x1={d.x} y1={yy} x2={d.x - 6} y2={yy + d.l} opacity={d.o} />;
            })}
          </g>
        </svg>
      );
    }
    case 'sun': {
      const rise = interpolate(age, [0, fps * 0.8], [60, 0], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const cx = width * 0.5;
      const cy = (skyY ?? height * 0.12) + rise;
      return (
        <div style={s}>
          <div style={{ position: 'absolute', left: cx - 300, top: cy - 300, width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, ${withAlpha('#ffb15c', 0.65)} 0%, ${withAlpha(warm, 0.25)} 30%, rgba(0,0,0,0) 62%)` }} />
          <div style={{ position: 'absolute', left: cx - 64, top: cy - 64, width: 128, height: 128, borderRadius: '50%', background: `radial-gradient(circle at 45% 40%, #fff2c8 0%, #ffcf6a 35%, ${warm} 75%, #ff5a1f 100%)`, boxShadow: `0 0 60px ${withAlpha('#ffb15c', 0.8)}` }} />
        </div>
      );
    }
    case 'moon': {
      const cx = width * 0.78;
      const cy = skyY ?? height * 0.14;
      return (
        <svg width={width} height={height} style={s}>
          <defs>
            <radialGradient id="moonGlow"><stop offset="0%" stopColor="#dfe8ff" stopOpacity="0.5" /><stop offset="100%" stopColor="#dfe8ff" stopOpacity="0" /></radialGradient>
          </defs>
          <circle cx={cx} cy={cy} r={160} fill="url(#moonGlow)" />
          <path d={`M ${cx} ${cy - 62} A 62 62 0 1 1 ${cx - 2} ${cy + 62} A 48 48 0 1 0 ${cx} ${cy - 62} Z`} fill="#f3ecdc" />
          {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={cx - 420 + r() * 520} cy={cy - 90 + r() * 260} r={1.5 + r() * 2.5} fill="#fff6e0" opacity={0.5 + 0.5 * Math.sin(t * 2 + i)} />)}
        </svg>
      );
    }
    case 'stars': {
      const stars = Array.from({ length: 12 }, () => ({ x: x - 220 + r() * 520, y: y - 300 + r() * 360, sz: 10 + r() * 22, ph: r() * 6 }));
      return (
        <svg width={width} height={height} style={s}>
          <g fill="#fff3dc">
            {stars.map((st, i) => {
              const tw = Math.max(0, Math.sin(t * 2.2 + st.ph));
              const sz = st.sz * (0.3 + tw * 0.7);
              const th = sz * 0.1;
              return <path key={i} d={`M ${st.x} ${st.y - sz} Q ${st.x + th} ${st.y - th} ${st.x + sz} ${st.y} Q ${st.x + th} ${st.y + th} ${st.x} ${st.y + sz} Q ${st.x - th} ${st.y + th} ${st.x - sz} ${st.y} Q ${st.x - th} ${st.y - th} ${st.x} ${st.y - sz} Z`} opacity={0.4 + tw * 0.6} />;
            })}
          </g>
        </svg>
      );
    }
    case 'heart': {
      const beat = 1 + 0.12 * Math.max(0, Math.sin(t * Math.PI * 2 * 1.2)) ** 3;
      return (
        <svg width={width} height={height} style={s}>
          <g transform={`translate(${width * 0.72} ${y - 40}) scale(${beat})`}>
            <path d="M0 28 C -40 -10, -70 20, 0 70 C 70 20, 40 -10, 0 28 Z" fill={withAlpha(accent, 0.9)} stroke="#ffb4b4" strokeWidth="3" style={{ filter: `drop-shadow(0 0 18px ${withAlpha(accent, 0.8)})` }} />
          </g>
        </svg>
      );
    }
    case 'fire': {
      const embers = Array.from({ length: 40 }, () => ({ x: r() * width, y: height + r() * 200, sp: 120 + r() * 240, sz: 2 + r() * 4, dr: (r() - 0.5) * 60 }));
      const flick = 0.75 + 0.25 * Math.sin(t * 17) * Math.sin(t * 7.3);
      return (
        <div style={s}>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(0deg, ${withAlpha('#ff5a1a', 0.55 * flick)} 0%, ${withAlpha(warm, 0.2 * flick)} 30%, rgba(0,0,0,0) 60%)` }} />
          <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
            {embers.map((e, i) => <circle key={i} cx={e.x + Math.sin(t * 2 + i) * e.dr} cy={e.y - t * e.sp} r={e.sz} fill="#ffb15c" opacity={0.4 + 0.6 * Math.abs(Math.sin(t * 5 + i))} />)}
          </svg>
        </div>
      );
    }
    case 'photo': {
      const slide = interpolate(age, [0, fps * 0.6], [1, 0], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const rot = -8 + r() * 6;
      return (
        <div style={s}>
          <div style={{ position: 'absolute', left: width * 0.6 + slide * 200, top: y - 240, width: 300, height: 360, background: '#efe6d6', padding: '14px 14px 70px', boxSizing: 'border-box', transform: `rotate(${rot}deg)`, boxShadow: '0 30px 60px rgba(0,0,0,0.7)' }}>
            <div style={{ width: '100%', height: '100%', background: `radial-gradient(ellipse at 40% 30%, ${withAlpha(warm, 0.9)} 0%, #4a2a18 60%, #120a06 100%)` }} />
          </div>
        </div>
      );
    }
    case 'clock': {
      const cx = width * 0.76;
      const cy = y - 60;
      const minute = t * 160;
      const hour = t * 13;
      return (
        <svg width={width} height={height} style={s}>
          <circle cx={cx} cy={cy} r={78} fill="#120f0d" stroke="#5a534f" strokeWidth="3" />
          {Array.from({ length: 12 }, (_, i) => <line key={i} x1={cx + Math.cos((i / 12) * Math.PI * 2) * 66} y1={cy + Math.sin((i / 12) * Math.PI * 2) * 66} x2={cx + Math.cos((i / 12) * Math.PI * 2) * 72} y2={cy + Math.sin((i / 12) * Math.PI * 2) * 72} stroke="#aaa096" strokeWidth="2" />)}
          <line x1={cx} y1={cy} x2={cx + Math.cos(((hour - 90) * Math.PI) / 180) * 40} y2={cy + Math.sin(((hour - 90) * Math.PI) / 180) * 40} stroke="#f4eee5" strokeWidth="5" strokeLinecap="round" />
          <line x1={cx} y1={cy} x2={cx + Math.cos(((minute - 90) * Math.PI) / 180) * 60} y2={cy + Math.sin(((minute - 90) * Math.PI) / 180) * 60} stroke={accent} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    }
    case 'smile': {
      const draw = interpolate(age, [0, fps * 0.7], [0, 1], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const len = 420;
      return (
        <svg width={width} height={height} style={s}>
          <path d={`M ${width * 0.56} ${y - 40} Q ${width * 0.7} ${y + 90} ${width * 0.84} ${y - 40}`} fill="none" stroke={warm} strokeWidth="9" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} style={{ filter: `drop-shadow(0 0 16px ${withAlpha(warm, 0.9)})` }} />
          <circle cx={width * 0.62} cy={y - 120} r={7} fill={warm} opacity={draw} />
          <circle cx={width * 0.78} cy={y - 120} r={7} fill={warm} opacity={draw} />
        </svg>
      );
    }
    case 'wave': {
      const bars = Array.from({ length: 28 }, (_, i) => i);
      return (
        <svg width={width} height={height} style={s}>
          {bars.map((i) => {
            const h = 10 + 60 * Math.abs(Math.sin(t * 6 + i * 0.7)) * (0.5 + 0.5 * Math.sin(i * 0.4));
            return <rect key={i} x={width * 0.55 + i * 14} y={y - 40 - h / 2} width={8} height={h} rx={3} fill={i % 3 === 0 ? accent : '#f4eee5'} opacity={0.8} />;
          })}
        </svg>
      );
    }
    case 'smoke': {
      const puffs = Array.from({ length: 7 }, () => ({ x: x + 220 + r() * 160, y: y - 40, sz: 60 + r() * 80, sp: 50 + r() * 60, dr: (r() - 0.5) * 80, d: r() }));
      return (
        <div style={s}>
          {puffs.map((p, i) => {
            const k = ((t * 0.35 + p.d) % 1);
            return <div key={i} style={{ position: 'absolute', left: p.x + Math.sin(k * 6 + i) * p.dr - p.sz / 2, top: p.y - k * 520 - p.sz / 2, width: p.sz * (0.6 + k), height: p.sz * (0.6 + k), borderRadius: '50%', background: withAlpha('#cfc6bb', 0.22 * (1 - k)), filter: 'blur(14px)' }} />;
          })}
        </div>
      );
    }
    case 'loop': {
      const spin = t * 90;
      return (
        <svg width={width} height={height} style={s}>
          <g transform={`translate(${width * 0.74} ${y - 30}) rotate(${spin})`}>
            <circle r="42" fill="none" stroke={withAlpha('#f4eee5', 0.85)} strokeWidth="6" strokeDasharray="200 64" strokeLinecap="round" />
            <path d="M 40 -14 L 48 2 L 30 4 Z" fill="#f4eee5" />
          </g>
        </svg>
      );
    }
    case 'glass':
    default:
      return null;
  }
};
