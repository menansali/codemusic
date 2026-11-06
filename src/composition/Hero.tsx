import React from 'react';
import { Easing, interpolate, random } from 'remotion';
import { COLORS, FONT_FAMILY, withAlpha } from '../editor/theme';
import type { Storyboard } from '../schema/storyboard';

export type HeroKind = NonNullable<Storyboard['hero']>;

type HeroProps = {
  kind: HeroKind;
  frame: number;
  fps: number;
  width: number;
  height: number;
  storyboard: Storyboard;
  /** 0..1 music level at this frame. */
  level: number;
  /** 0 hidden, 1 fully shown (fades for the reveal). */
  presence: number;
  /** 0..1 kick-drum punch at this frame. */
  punch?: number;
};

/** The hero set piece sits in the top third of the frame, above the code, for the whole song reel. */
export const Hero: React.FC<HeroProps> = (p) => {
  if (p.kind === 'none' || p.presence <= 0.01) return null;
  const box: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: p.width, height: p.height * 0.34, opacity: p.presence, pointerEvents: 'none' };
  return (
    <div style={box}>
      {/* 'neon' (a glowing sign) was retired: no glow in the reels. Old storyboards that ask for it get nothing. */}
      {p.kind === 'tape' ? <Tape {...p} /> : null}
      {p.kind === 'player' ? <Player {...p} /> : null}
      {p.kind === 'horizon' ? <Horizon {...p} /> : null}
    </div>
  );
};

/** Cassette deck: spinning reels, title label, transport state and a tape counter. */
const Tape: React.FC<HeroProps> = ({ frame, fps, width, height, storyboard, level }) => {
  const t = frame / fps;
  const w = width * 0.66;
  const h = w * 0.62;
  const x = (width - w) / 2;
  const y = height * 0.045;
  const spin = t * 160;
  const reel = (cx: number, cy: number, r: number, k: string) => (
    <g transform={`translate(${cx} ${cy}) rotate(${spin})`} key={k}>
      <circle r={r} fill="#141110" stroke="#cfc6bb" strokeWidth="3" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <rect key={a} x={-3} y={-r + 4} width={6} height={r * 0.42} fill="#cfc6bb" transform={`rotate(${a})`} rx={2} />
      ))}
      <circle r={r * 0.28} fill="#2b2522" />
    </g>
  );
  const counter = String(Math.floor((storyboard.song?.startSec ?? 0) * 2 + t * 2)).padStart(3, '0');
  return (
    <svg width={width} height={height * 0.34} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      <g transform={`translate(${x} ${y}) rotate(-3 ${w / 2} ${h / 2})`}>
        <rect width={w} height={h} rx={22} fill="#e9e1d3" stroke="#6b645f" strokeWidth="3" />
        <rect x={w * 0.06} y={h * 0.08} width={w * 0.88} height={h * 0.26} rx={8} fill="#f6f0e6" />
        <rect x={w * 0.06} y={h * 0.08} width={w * 0.88} height={h * 0.06} fill={storyboard.palette.accent} opacity={0.85} />
        <text x={w * 0.1} y={h * 0.27} fill="#2b2522" fontFamily={FONT_FAMILY} fontSize={h * 0.085} fontWeight={700}>
          {(storyboard.song?.title ?? storyboard.title).slice(0, 22)}
        </text>
        <rect x={w * 0.18} y={h * 0.42} width={w * 0.64} height={h * 0.34} rx={h * 0.17} fill="#1a1614" />
        {reel(w * 0.33, h * 0.59, h * 0.13, 'l')}
        {reel(w * 0.67, h * 0.59, h * 0.13, 'r')}
        <rect x={w * 0.42} y={h * 0.52} width={w * 0.16} height={h * 0.14} fill="#3a2a20" opacity={0.9} />
      </g>
      <g transform={`translate(${width * 0.5 - 150} ${y + h + 28})`} fontFamily={FONT_FAMILY}>
        <rect width={300} height={54} rx={10} fill="#120f0d" stroke="#3a332b" strokeWidth="2" />
        <text x={18} y={36} fill={storyboard.palette.warm} fontSize={28}>{counter}</text>
        <text x={112} y={36} fill={COLORS.textDim} fontSize={24}>{'⏪  ▶  ■'}</text>
        <rect x={262} y={18} width={18} height={18} rx={3} fill={storyboard.palette.accent} opacity={0.6 + level * 0.4} />
      </g>
    </svg>
  );
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Now-playing card with the real song position, progress bar and a level meter. */
const Player: React.FC<HeroProps> = ({ frame, fps, width, height, storyboard, level }) => {
  const song = storyboard.song;
  const pos = (song?.startSec ?? 0) + frame / fps;
  const dur = song?.durationSec ?? 1;
  const w = width * 0.8;
  const x = (width - w) / 2;
  const y = height * 0.07;
  const bars = Array.from({ length: 18 }, (_, i) => i);
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, padding: '34px 38px', boxSizing: 'border-box', background: withAlpha('#120f0d', 0.92), border: `2px solid ${withAlpha('#3a332b', 0.9)}`, borderRadius: 26, fontFamily: FONT_FAMILY }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', background: storyboard.palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 0, height: 0, borderLeft: '28px solid #fff6ee', borderTop: '18px solid transparent', borderBottom: '18px solid transparent', marginLeft: 8 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 44, fontWeight: 700, color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song?.title ?? storyboard.title}</div>
          <div style={{ fontSize: 28, color: COLORS.textDim, marginTop: 6 }}>{song?.artist ?? ''}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60 }}>
          {bars.slice(0, 7).map((i) => (
            <div key={i} style={{ width: 7, borderRadius: 3, background: i % 3 === 0 ? storyboard.palette.accent : COLORS.text, height: 8 + 50 * level * (0.4 + 0.6 * Math.abs(Math.sin(frame * 0.35 + i * 1.3))) }} />
          ))}
        </div>
      </div>
      <div style={{ marginTop: 30, height: 8, borderRadius: 4, background: '#2b2522', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, (pos / dur) * 100)}%`, height: '100%', background: storyboard.palette.accent }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 24, color: COLORS.textDim }}>
        <span>{fmt(pos)}</span>
        <span>{fmt(dur)}</span>
      </div>
    </div>
  );
};

/** Stacked line terrain that breathes with the music under a low sun (split warm/red like a stereo meter). */
const Horizon: React.FC<HeroProps> = ({ frame, fps, width, height, storyboard, level }) => {
  const t = frame / fps;
  const H = height * 0.34;
  const rows = 13;
  const sunY = H * 0.36;
  const rise = interpolate(frame, [0, fps * 1.2], [30, 0], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const paths: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    const depth = r / (rows - 1);
    const y0 = H * 0.42 + depth * depth * H * 0.55;
    const amp = (10 + depth * 46) * (0.45 + level * 0.9);
    const pts: string[] = [];
    for (let i = 0; i <= 48; i++) {
      const x = (i / 48) * width;
      const c = Math.abs(i / 48 - 0.5) * 2;
      const valley = 0.35 + c * 0.9;
      const n = Math.sin(i * 0.55 + r * 1.7 + t * 1.3) * 0.6 + Math.sin(i * 1.31 - r * 0.9 - t * 0.8) * 0.4;
      pts.push(`${x.toFixed(1)},${(y0 - Math.abs(n) * amp * valley).toFixed(1)}`);
    }
    const left = `M ${pts.slice(0, 25).join(' L ')}`;
    const right = `M ${pts.slice(24).join(' L ')}`;
    const a = 0.25 + depth * 0.75;
    paths.push(<path key={`l${r}`} d={left} fill="none" stroke="#ffd9a0" strokeWidth={1.4 + depth * 1.6} opacity={a} />);
    paths.push(<path key={`r${r}`} d={right} fill="none" stroke={storyboard.palette.accent} strokeWidth={1.4 + depth * 1.6} opacity={a} />);
  }
  return (
    <svg width={width} height={H} style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <radialGradient id="hzSun">
          <stop offset="0%" stopColor="#fff2c8" />
          <stop offset="40%" stopColor="#ffcf6a" />
          <stop offset="100%" stopColor={storyboard.palette.warm} />
        </radialGradient>
        <radialGradient id="hzGlow">
          <stop offset="0%" stopColor={storyboard.palette.warm} stopOpacity="0.7" />
          <stop offset="100%" stopColor={storyboard.palette.warm} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hzSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff5a1c" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#3a1005" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={width} height={H * 0.5} fill="url(#hzSky)" />
      <circle cx={width / 2} cy={sunY + rise} r={190 + level * 40} fill="url(#hzGlow)" />
      <circle cx={width / 2} cy={sunY + rise} r={70} fill="url(#hzSun)" />
      <rect x={0} y={H * 0.4} width={width} height={H * 0.6} fill="#000" opacity={0.85} />
      {paths}
    </svg>
  );
};
