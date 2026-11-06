import React from 'react';
import { Easing, interpolate } from 'remotion';
import { FONT_FAMILY, useColors, withAlpha } from '../editor/theme';

type Twist = { kind: 'comment' | 'run' | 'error' | 'replace' | 'git' | 'join'; text: string; from?: string | null; to?: string | null; log: string[] };

const ease = Easing.out(Easing.cubic);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Frame (reveal-local) where each twist beat happens. Shared with the scene for code edits. */
export const TWIST_T = { press: 0.75, open: 0.95, text: 1.25, find: 0.95, swap: 1.75 };

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 7);
};

/** Screen-space twist: Run button + console, compile error, find/replace bar, or git log. */
/** When the error twist's crash beats happen (reveal-local seconds, before the scene's twist delay). */
export const CRASH_T = { trace: TWIST_T.text + 0.25, step: 2, card: 0.3 };

export const TwistOverlay: React.FC<{ twist: Twist; frame: number; fps: number; width: number; height: number; accent: string; filename: string; lastLine: number; joinName?: string | null; joinColor?: string; trace?: string[]; endFrame?: number }> = ({ twist, frame, fps, width, height, accent, filename, lastLine, joinName = null, joinColor = '#3d8bff', trace = [], endFrame = 1e9 }) => {
  const C = useColors();
  const f = (s: number) => Math.round(s * fps);
  const panelTop = height * 0.5;
  const panelH = height * 0.27;
  const open = interpolate(frame, [f(TWIST_T.open), f(TWIST_T.open) + 8], [0, 1], { easing: ease, ...clamp });
  const typed = (s: string, startSec: number, cf = 2) => s.slice(0, Math.max(0, Math.floor((frame - f(startSec)) / cf) + 1));
  const cursor = (on: boolean) => <span style={{ display: 'inline-block', width: '0.6em', height: '1.05em', verticalAlign: '-0.18em', background: accent, opacity: on ? 1 : 0, marginLeft: 4 }} />;
  const blink = Math.floor(frame / 8) % 2 === 0;
  const panel = (children: React.ReactNode, border = '#3a332b') => (
    <div style={{ position: 'absolute', left: width * 0.05, width: width * 0.9, top: panelTop + (1 - open) * 80, height: panelH, opacity: open, background: withAlpha('#0c0a09', 0.96), border: `2px solid ${border}`, borderRadius: 18, boxShadow: '0 -20px 80px rgba(0,0,0,0.75)', fontFamily: FONT_FAMILY, fontSize: 36, color: C.text, padding: '26px 32px', boxSizing: 'border-box', overflow: 'hidden' }}>
      <div style={{ fontSize: 24, color: '#8a8178', marginBottom: 18 }}>Terminal</div>
      {children}
    </div>
  );

  if (twist.kind === 'run' || twist.kind === 'git') {
    const pressed = frame >= f(TWIST_T.press);
    const press = interpolate(frame, [f(TWIST_T.press) - 2, f(TWIST_T.press), f(TWIST_T.press) + 4], [0, 1, 0], clamp);
    const button = (
      <div style={{ position: 'absolute', right: width * 0.07, top: height * 0.07, padding: '14px 26px', borderRadius: 12, fontFamily: FONT_FAMILY, fontSize: 32, fontWeight: 500, background: pressed ? accent : withAlpha(accent, 0.25), color: '#fff', transform: `scale(${1 - press * 0.04})` }}>
        {'▶'} {twist.kind === 'git' ? 'git log' : 'Çalıştır'}
      </div>
    );
    if (twist.kind === 'run') {
      const cmd = `$ node ${filename}`;
      return (
        <>
          {button}
          {frame >= f(TWIST_T.open)
            ? panel(
                <>
                  <div style={{ color: '#8a8178' }}>{typed(cmd, TWIST_T.open, 1)}</div>
                  <div style={{ marginTop: 22, fontSize: 46, fontWeight: 700, color: C.text, whiteSpace: 'pre-wrap', lineHeight: 1.25 }}>
                    {frame >= f(TWIST_T.text) ? typed(twist.text, TWIST_T.text, 2) : ''}
                    {cursor(blink || frame < f(TWIST_T.text) + twist.text.length * 2)}
                  </div>
                </>,
              )
            : null}
        </>
      );
    }
    const log = [...twist.log.slice(-5)];
    return (
      <>
        {button}
        {frame >= f(TWIST_T.open)
          ? panel(
              <>
                <div style={{ color: '#8a8178' }}>{typed('$ git log --oneline', TWIST_T.open, 1)}</div>
                <div style={{ marginTop: 14, fontSize: 30, lineHeight: 1.5 }}>
                  {log.map((l, i) => {
                    const at = f(TWIST_T.text) + i * 6;
                    return frame >= at ? (
                      <div key={i} style={{ opacity: interpolate(frame, [at, at + 4], [0, 1], clamp), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ color: '#e8b65a' }}>{hash(l)}</span> <span style={{ color: '#b5aca2' }}>{l}</span>
                      </div>
                    ) : null;
                  })}
                  {frame >= f(TWIST_T.text) + log.length * 6 + 6 ? (
                    <div style={{ marginTop: 8, fontSize: 38, fontWeight: 700 }}>
                      <span style={{ color: accent }}>{hash(twist.text)} (HEAD)</span> {typed(twist.text || 'gerçek hikâye.', (f(TWIST_T.text) + log.length * 6 + 6) / fps, 2)}
                      {cursor(blink)}
                    </div>
                  ) : null}
                </div>
              </>,
            )
          : null}
      </>
    );
  }

  if (twist.kind === 'join') {
    // Presence notice, like a shared editor: someone opened the file. Quiet, top of frame.
    const k = interpolate(frame, [f(TWIST_T.press), f(TWIST_T.press) + 7], [0, 1], { easing: ease, ...clamp });
    if (k <= 0 || !joinName) return null;
    return (
      <div style={{ position: 'absolute', left: 0, right: 0, top: height * 0.8 + (1 - k) * 16, display: 'flex', justifyContent: 'center', opacity: k, fontFamily: FONT_FAMILY }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '18px 30px 18px 18px', borderRadius: 14, background: '#1a1817', border: '2px solid rgba(255,255,255,0.08)' }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: joinColor, color: '#fff', fontSize: 30, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{joinName.slice(0, 1).toLocaleUpperCase('tr')}</div>
          <div>
            <div style={{ fontSize: 34, color: '#e9e4dc' }}>{`${joinName} katıldı`}</div>
            {twist.text ? <div style={{ fontSize: 26, color: '#8a8178', marginTop: 4 }}>{twist.text.replace(/\.$/, '')}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  if (twist.kind === 'error') {
    const hit = f(TWIST_T.press);
    const flash = interpolate(frame, [hit, hit + 2, hit + 12], [0, 0.55, 0], clamp);
    const text = twist.text.includes(':') ? twist.text : `TypeError: ${twist.text}`;
    // The crash: a stack trace made of the song's own lines (newest first) runs past, the process dies,
    // then a hard cut to black and the true story note.
    const frames = crashTrace(trace, filename);
    const t0 = f(CRASH_T.trace);
    const shownN = Math.max(0, Math.min(frames.length, Math.floor((frame - t0) / CRASH_T.step) + 1));
    const traceEnd = t0 + frames.length * CRASH_T.step;
    const note = twist.log[twist.log.length - 1]?.replace(/\.$/, '') ?? null;
    const cardAt = traceEnd + f(CRASH_T.card);
    const card = note && frame >= cardAt && endFrame - cardAt >= f(0.6);
    const rowH = 40;
    return (
      <>
        <div style={{ position: 'absolute', inset: 0, background: `rgba(255, 30, 40, ${flash})`, mixBlendMode: 'screen' }} />
        {frame >= f(TWIST_T.open)
          ? panel(
              <>
                <div style={{ color: '#ff5c5c', fontSize: 42, fontWeight: 700, whiteSpace: 'pre-wrap', lineHeight: 1.25 }}>
                  {'✖'} {text}
                </div>
                <div style={{ position: 'relative', height: panelH - 190, overflow: 'hidden', marginTop: 14 }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, fontSize: 27, lineHeight: `${rowH}px`, color: '#8a8178', whiteSpace: 'nowrap' }}>
                    {frame >= f(TWIST_T.text) ? <div>{`    at ${filename}:${lastLine}`}</div> : null}
                    {frames.slice(0, shownN).map((l, i) => (
                      <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{l}</div>
                    ))}
                    {frame >= traceEnd + 3 && frames.length ? <div style={{ color: '#ff5c5c', marginTop: 6 }}>Process exited with code 1</div> : null}
                  </div>
                </div>
              </>,
              '#7a1f1f',
            )
          : null}
        {card ? (
          <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', alignItems: 'center', padding: `0 ${width * 0.09}px`, fontFamily: FONT_FAMILY }}>
            <div style={{ fontSize: Math.min(64, Math.floor((width * 0.82) / ((Math.min(note!.length, 20) + 3) * 0.6))), fontWeight: 500, color: '#f2f2f0', lineHeight: 1.3, whiteSpace: 'pre-wrap' }}>
              <span style={{ color: '#7a7a76' }}>{'// '}</span>
              {note!.slice(0, Math.max(1, frame - cardAt + 1))}
              {cursor(blink || frame - cardAt < note!.length)}
            </div>
          </div>
        ) : null}
      </>
    );
  }

  if (twist.kind === 'replace') {
    const k = interpolate(frame, [f(0.45), f(0.45) + 8], [0, 1], { easing: ease, ...clamp });
    const swapped = frame >= f(TWIST_T.swap);
    const box = (label: string, value: string, hl: boolean) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
        <span style={{ width: 150, fontSize: 24, color: '#8a8178' }}>{label}</span>
        <span style={{ flex: 1, padding: '10px 16px', borderRadius: 8, background: '#1a1614', border: `2px solid ${hl ? accent : '#3a332b'}`, fontSize: 34, color: C.text }}>{value}</span>
      </div>
    );
    return (
      <div style={{ position: 'absolute', left: width * 0.06, width: width * 0.88, top: height * 0.045 - (1 - k) * 60, opacity: k, background: withAlpha('#0c0a09', 0.97), border: '2px solid #3a332b', borderRadius: 16, padding: '20px 26px', boxSizing: 'border-box', fontFamily: FONT_FAMILY, boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
        {box('Bul', twist.from ?? '', frame >= f(TWIST_T.find) && !swapped)}
        {box('Değiştir', typed(twist.to ?? '', 0.6, 2), swapped)}
        <div style={{ marginTop: 14, fontSize: 24, color: swapped ? '#7dff9a' : '#8a8178', textAlign: 'right' }}>{swapped ? 'Tümü değiştirildi.' : 'Tümünü değiştir'}</div>
      </div>
    );
  }
  return null;
};

/** Stack frames from code lines: `at <first name> (file:line:col)`, newest line first, at most seven. */
function crashTrace(lines: string[], filename: string): string[] {
  const out: string[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < 7; i--) {
    const m = lines[i]!.match(/[\p{L}_$][\p{L}\p{N}_$]*/u);
    if (!m || lines[i]!.trim().startsWith('//')) continue;
    out.push(`    at ${m[0]} (${filename}:${i + 1}:${(m.index ?? 0) + 1})`);
  }
  return out;
}
