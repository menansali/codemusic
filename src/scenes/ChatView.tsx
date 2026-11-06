import React from 'react';
import { Easing, interpolate } from 'remotion';
import type { Storyboard } from '../schema/storyboard';
import { typedCount, type LyricPlan } from '../schema/timeline';
import { withAlpha } from '../editor/theme';

const SANS = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

export type ChatMessage = { text: string; speaker: number; time: string };

type Props = {
  storyboard: Storyboard;
  names: string[];
  history: ChatMessage[];
  /** Live messages in this scene: plan range per sung line. */
  live: { raw: string; speaker: number; plans: LyricPlan[] }[];
  frame: number;
  fps: number;
  width: number;
  height: number;
  songTime: number;
  system: string | null;
  t: number;
  /** Twist: my last message gets deleted (0..1 progress). */
  deleteK?: number;
};

const clock = (s: number) => `${String(21 + Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s / 60) % 60) + 14).padStart(2, '0')}`;

/** Lyrics as a WhatsApp-style thread: typing in the input bar, "yazıyor…", bubbles with ticks. */
export const ChatView: React.FC<Props> = ({ storyboard, names, history, live, frame, fps, width, height, songTime, system, t, deleteK = 0 }) => {
  const me = names[0] ?? 'ben';
  const them = names[1] ?? storyboard.song?.artist ?? 'o';
  const sent: ChatMessage[] = [...history];
  let typing: { text: string; speaker: number } | null = null;
  for (const m of live) {
    const first = m.plans[0];
    const last = m.plans[m.plans.length - 1];
    if (!first || !last || frame < first.startFrame) continue;
    const total = m.plans.reduce((a, p) => a + p.text.length, 0);
    const done = m.plans.reduce((a, p) => a + typedCount(p, frame), 0);
    const finished = m.plans.every((p) => typedCount(p, frame) >= p.text.length) && frame > last.startFrame + last.text.length * last.charFrames + 4;
    if (finished) sent.push({ text: m.raw, speaker: m.speaker, time: clock(songTime) });
    else typing = { text: m.raw.slice(0, Math.round((done / Math.max(1, total)) * m.raw.length)), speaker: m.speaker };
  }
  const shown = sent.slice(-7);
  const bubbleIn = (i: number) => (i === shown.length - 1 ? interpolate(frame % 100000, [0, 1], [1, 1]) : 1);
  const push = 1 + 0.03 * Math.min(1, t / 4);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0b141a', fontFamily: SANS, transform: `scale(${push})`, transformOrigin: '50% 60%' }}>
      {/* wallpaper doodle tint */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 30% 20%, ${withAlpha('#1f2c33', 0.9)} 0%, #0b141a 70%)` }} />
      {/* header */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 210, background: '#202c33', display: 'flex', alignItems: 'flex-end', padding: '0 40px 28px', boxSizing: 'border-box', gap: 26 }}>
        <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#6b7c85', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, color: '#e9edef', fontWeight: 600 }}>{them.slice(0, 1).toLocaleUpperCase('tr')}</div>
        <div>
          <div style={{ fontSize: 44, color: '#e9edef', fontWeight: 600 }}>{them}</div>
          <div style={{ fontSize: 30, color: typing && typing.speaker === 1 ? '#25d366' : '#8696a0', marginTop: 4 }}>{typing && typing.speaker === 1 ? 'yazıyor…' : 'çevrimiçi'}</div>
        </div>
      </div>
      {/* thread */}
      <div style={{ position: 'absolute', left: 36, right: 36, bottom: 300, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {system ? (
          <div style={{ alignSelf: 'center', background: '#182229', color: '#ffd279', fontSize: 34, padding: '16px 28px', borderRadius: 16, maxWidth: '86%', textAlign: 'center' }}>{system}</div>
        ) : null}
        {shown.map((m, i) => {
          const mine = m.speaker === 0;
          const lastMine = shown.map((x) => x.speaker).lastIndexOf(0);
          if (deleteK > 0 && i === lastMine) {
            const gone = deleteK > 0.5;
            return (
              <div key={`${i}-del`} style={{ alignSelf: 'flex-end', maxWidth: '82%', background: '#005c4b', color: gone ? '#8696a0' : '#e9edef', fontSize: 46, lineHeight: 1.3, padding: '18px 26px 14px', borderRadius: 22, borderTopRightRadius: 6, fontStyle: gone ? 'italic' : 'normal', opacity: gone ? 1 : 1 - deleteK * 1.6, transform: `scale(${gone ? 1 : 1 - deleteK * 0.1})`, filter: gone ? undefined : `blur(${(deleteK * 8).toFixed(1)}px)` }}>
                {gone ? <><span style={{ marginRight: 14 }}>{'⊘'}</span>Bu mesaj silindi</> : m.text}
              </div>
            );
          }
          return (
            <div key={`${i}-${m.text}`} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', background: mine ? '#005c4b' : '#202c33', color: '#e9edef', fontSize: 46, lineHeight: 1.3, padding: '18px 26px 14px', borderRadius: 22, borderTopRightRadius: mine ? 6 : 22, borderTopLeftRadius: mine ? 22 : 6, opacity: bubbleIn(i) }}>
              {m.text}
              <span style={{ fontSize: 24, color: '#8696a0', marginLeft: 18, whiteSpace: 'nowrap' }}>
                {m.time} {mine ? <span style={{ color: '#53bdeb' }}>{'✓✓'}</span> : null}
              </span>
            </div>
          );
        })}
        {typing && typing.speaker === 1 ? (
          <div style={{ alignSelf: 'flex-start', background: '#202c33', borderRadius: 22, padding: '22px 30px', display: 'flex', gap: 10 }}>
            {[0, 1, 2].map((d) => (
              <span key={d} style={{ width: 16, height: 16, borderRadius: '50%', background: '#8696a0', opacity: 0.4 + 0.6 * Math.max(0, Math.sin(frame * 0.35 - d * 0.9)) }} />
            ))}
          </div>
        ) : null}
      </div>
      {/* input bar: my typing shows here */}
      <div style={{ position: 'absolute', left: 24, right: 24, bottom: 120, height: 130, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ flex: 1, height: '100%', borderRadius: 65, background: '#2a3942', display: 'flex', alignItems: 'center', padding: '0 40px', fontSize: 44, color: typing && typing.speaker === 0 ? '#e9edef' : '#8696a0', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {typing && typing.speaker === 0 ? typing.text : 'Mesaj'}
          {typing && typing.speaker === 0 ? <span style={{ display: 'inline-block', width: 4, height: 52, background: '#25d366', marginLeft: 6, opacity: Math.floor(frame / 8) % 2 ? 1 : 0.2 }} /> : null}
        </div>
        <div style={{ width: 130, height: 130, borderRadius: '50%', background: '#00a884', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 0, height: 0, borderLeft: '42px solid #fff', borderTop: '26px solid transparent', borderBottom: '26px solid transparent', marginLeft: 10 }} />
        </div>
      </div>
      <div style={{ position: 'absolute', right: 48, top: 24, fontSize: 28, color: '#8696a0' }}>{me}</div>
    </div>
  );
};

export const chatEase = Easing.out(Easing.cubic);
