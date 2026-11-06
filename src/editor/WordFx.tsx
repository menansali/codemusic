import React from 'react';
import { random } from 'remotion';
import type { MarkKind } from '../lyrics/lexicon';

/** Marks handled here: the letters act out the word. strike/underline/shatter stay in CodeEditor. */
export const LETTER_FX = new Set<MarkKind>(['burn', 'frost', 'fall', 'float', 'dissolve', 'shout', 'whisper', 'pulse', 'bounce', 'shine']);

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const bounceOut = (p: number) => {
  const n = 7.5625;
  const d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
  if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
  return n * (p -= 2.625 / d) * p + 0.984375;
};
const mix = (a: [number, number, number], b: [number, number, number], k: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * k)).join(',')})`;

/**
 * One word, letter by letter. `age` = frames since the word finished typing (large for old lines).
 * `pulse` 0..1 is the kick/beat envelope for heartbeat words.
 */
export const WordFx: React.FC<{ kind: MarkKind; text: string; age: number; base: React.CSSProperties; accent: string; fontSize: number; seed: string; pulse: number }> = ({ kind, text, age, base, accent, fontSize, seed, pulse }) => {
  const letters = text.split('');
  const r = (ci: number, k: string) => random(`wfx-${seed}-${text}-${ci}-${k}`);
  const em = fontSize;

  if (kind === 'shout') {
    const s = 1.12 + 0.75 * Math.exp(-age / 5);
    const shake = Math.exp(-age / 9);
    return (
      <span style={{ ...base, display: 'inline-block', color: accent, fontWeight: 700, transform: `translate(${(Math.sin(age * 2.3) * 0.09 * em * shake).toFixed(1)}px, ${(Math.cos(age * 3.1) * 0.06 * em * shake).toFixed(1)}px) scale(${s.toFixed(3)})`, transformOrigin: '50% 70%' }}>
        {text}
      </span>
    );
  }
  if (kind === 'whisper') {
    const k = clamp01(age / 10);
    return (
      <span style={{ ...base, display: 'inline-block', opacity: 1 - 0.45 * k, transform: `scale(${(1 - 0.26 * k).toFixed(3)})`, transformOrigin: '0% 70%' }}>
        {text}
      </span>
    );
  }
  if (kind === 'pulse') {
    const p = pulse * clamp01(age / 4);
    return (
      <span style={{ ...base, display: 'inline-block', color: p > 0.25 ? accent : base.color, transform: `scale(${(1 + 0.16 * p).toFixed(3)})`, transformOrigin: '50% 60%' }}>
        {text}
      </span>
    );
  }

  return (
    <span style={base}>
      {letters.map((ch, ci) => {
        const st: React.CSSProperties = { display: 'inline-block', position: 'relative' };
        const extra: React.ReactNode = null;
        if (kind === 'burn') {
          // heat up fast, flicker, cool to charred red
          const heat = age < 8 ? age / 8 : Math.max(0.28, 1 - (age - 8) / 40);
          const flick = 0.75 + 0.25 * random(`burn-${seed}-${ci}-${Math.floor(age / 2)}`);
          const h = heat * flick;
          st.color = h > 0.66 ? mix([255, 214, 140], [255, 250, 230], (h - 0.66) * 3) : h > 0.33 ? mix([255, 90, 20], [255, 214, 140], (h - 0.33) * 3) : mix([140, 40, 24], [255, 90, 20], h * 3);
        } else if (kind === 'frost') {
          const k = clamp01((age - ci * 1.2) / 12);
          st.color = mix([235, 230, 225], [196, 236, 255], k);
        } else if (kind === 'fall') {
          const t = age - ci * 1.6;
          const p = clamp01(t / 11);
          const y = bounceOut(p) * 0.5 * em;
          const rot = (r(ci, 'rot') - 0.5) * 34 * p;
          st.transform = `translateY(${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
          st.transformOrigin = '50% 100%';
        } else if (kind === 'float') {
          const t = age - ci * 1.3;
          const p = clamp01(t / 18);
          const y = -(p * p * (3 - 2 * p)) * 0.32 * em + Math.sin(age * 0.14 + ci * 0.9) * 0.05 * em * p;
          st.transform = `translateY(${y.toFixed(1)}px) rotate(${(Math.sin(age * 0.1 + ci) * 6 * p).toFixed(1)}deg)`;
        } else if (kind === 'dissolve') {
          const p = clamp01((age - 4 - ci * 1.4) / 16);
          st.opacity = 1 - 0.62 * p;
          st.transform = `translate(${((r(ci, 'dx') - 0.3) * 0.3 * em * p).toFixed(1)}px, ${(-0.35 * em * p).toFixed(1)}px)`;
        } else if (kind === 'bounce') {
          const t = age - ci * 1.6;
          const decay = Math.exp(-Math.max(0, age) / 38);
          const y = t > 0 ? -Math.abs(Math.sin(t * 0.42)) * 0.26 * em * decay : 0;
          st.transform = `translateY(${y.toFixed(1)}px) rotate(${(t > 0 ? Math.sin(t * 0.42) * 7 * decay : 0).toFixed(1)}deg)`;
        } else if (kind === 'shine') {
          // A hand-drawn underline that writes itself under the word once.
          const p = clamp01((age - ci * 0.8) / 4);
          st.backgroundImage = `linear-gradient(${accent}, ${accent})`;
          st.backgroundRepeat = 'no-repeat';
          st.backgroundPosition = '0 92%';
          st.backgroundSize = `${(p * 100).toFixed(0)}% 0.07em`;
        }
        return (
          <span key={ci} style={st}>
            {ch}
            {extra}
          </span>
        );
      })}
    </span>
  );
};
