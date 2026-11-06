import type { Scene, Storyboard } from './storyboard';

export type TypingPlan = {
  /** Scene-local frame at which the first character appears. */
  startFrame: number;
  /** Frames per character. */
  charFrames: number;
  text: string;
};

export type LyricPlan = TypingPlan & {
  lineIndex: number;
  speaker: number;
  fx: 'none' | 'slow' | 'backspace' | 'predict';
  /** Backspace: chars deleted after the first pass, and frames held before deleting. */
  del: number;
  hold: number;
  /** A human typo: `wrong` typed at `at`, `run` more chars typed before noticing, then fixed. */
  typo: Typo | null;
  /** A held note: the vowel at `at` repeats while it is sung, then the extra letters collapse. */
  stretch: Stretch | null;
};

/** `n` extra copies of `ch` typed after index `at` between frames `from` and `to`; rest of the line types at `to`. */
export type Stretch = { at: number; ch: string; n: number; from: number; to: number; collapseAt: number };

export type Typo = { at: number; wrong: string; run: number; hold: number; gap: number };

/** Turkish keyboard habit: the dotless/undotted twin first. Otherwise a neighbouring key. */
const TWIN: Record<string, string> = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'i': 'ı' };
const NEIGHBOR: Record<string, string> = { a: 's', b: 'v', c: 'x', d: 's', e: 'r', f: 'd', g: 'h', h: 'j', k: 'l', l: 'k', m: 'n', n: 'm', o: 'p', p: 'o', r: 'e', s: 'a', t: 'r', u: 'y', v: 'b', y: 'u', z: 'x' };

const hashStr = (t: string) => {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Deterministic typo for a line, placed on a letter that people actually miss (null if none fits the word). */
export function pickTypo(text: string, fps: number, salt = ''): Typo | null {
  const h = hashStr(`${salt}|${text}`);
  if (text.length < 8) return null;
  const letters = (ch: string | undefined) => !!ch && /\p{L}/u.test(ch);
  const candidates: { at: number; wrong: string; score: number }[] = [];
  for (let i = 3; i < text.length - 2; i++) {
    const ch = text[i]!;
    if (!letters(ch) || !letters(text[i + 1])) continue;
    const twin = TWIN[ch];
    const near = NEIGHBOR[ch];
    if (twin) candidates.push({ at: i, wrong: twin, score: ch === 'i' ? 1 : 3 });
    else if (near) candidates.push({ at: i, wrong: near, score: 1 });
  }
  if (!candidates.length) return null;
  const best = Math.max(...candidates.map((c) => c.score));
  const pool = candidates.filter((c) => c.score === best);
  const c = pool[(h >>> 4) % pool.length]!;
  let run = 1 + ((h >>> 9) % 2);
  while (run > 0 && !letters(text[c.at + run])) run--;
  return { at: c.at, wrong: c.wrong, run, hold: Math.round(fps * 0.16), gap: Math.round(fps * 0.05) };
}

export type SceneTiming = {
  index: number;
  type: Scene['type'];
  from: number;
  durationInFrames: number;
  typing: TypingPlan | null;
  /** For lyricEditor scenes: one plan per live line, in order. */
  lyrics: LyricPlan[];
};

export type Timeline = {
  fps: number;
  totalFrames: number;
  scenes: SceneTiming[];
  /** Absolute frames where a cut happens (start of every scene except the first). */
  cuts: number[];
  /** Absolute frames where a character is typed (for audio clicks). */
  typingFrames: number[];
};

/** Text that is typed live in a scene, if any. */
export function typedTextOf(scene: Scene): string | null {
  switch (scene.type) {
    case 'codeEditor':
      return scene.typedText ?? null;
    case 'macroCode':
      return scene.token;
    case 'typography':
      return scene.text;
    default:
      return null;
  }
}

export function typingPlan(scene: Scene, durationInFrames: number, fps: number, density: number): TypingPlan | null {
  const text = typedTextOf(scene);
  if (!text || text.length === 0) return null;
  const startFrame = Math.round(fps * (scene.type === 'typography' ? 0.35 : 0.5));
  // Typing should finish within ~60% of the scene, leaving the cursor to blink.
  const available = Math.max(fps * 0.6, durationInFrames * 0.6 - startFrame);
  const idealCharFrames = Math.round(fps * (0.07 + (1 - density) * 0.05));
  const charFrames = Math.max(2, Math.min(idealCharFrames, Math.floor(available / text.length)));
  return { startFrame, charFrames, text };
}

/** Each lyric line types from its `at` and must finish before the next line starts (or within 2.6 s). */
export function lyricPlans(scene: Scene, durationInFrames: number, fps: number, beatSec: number | null = null): LyricPlan[] {
  if (scene.type !== 'lyricEditor') return [];
  const plans: LyricPlan[] = [];
  const room: number[] = [];
  scene.lines.forEach((line, i) => {
    // Negative `at` = the line is already being typed when the scene opens (mid-action hook).
    const startFrame = Math.round(line.at * fps);
    const next = scene.lines[i + 1];
    const deadline = Math.min(next ? Math.round(next.at * fps) - Math.round(fps * 0.3) : durationInFrames - fps * 0.4, startFrame + Math.round(fps * 2.6));
    const available = Math.max(fps * 0.35, deadline - startFrame);
    let charFrames = Math.max(1, Math.min(4, Math.floor(available / Math.max(1, line.text.length))));
    // "Typed on every beat": snap the character cadence to the largest beat subdivision that still fits.
    if (beatSec) {
      for (const div of [4, 8, 16]) {
        const f = Math.max(1, Math.round((beatSec / div) * fps));
        if (f * line.text.length <= available) {
          charFrames = f;
          break;
        }
      }
    }
    let fx = line.fx ?? 'none';
    let del = 0;
    let hold = 0;
    if (fx === 'slow') charFrames = Math.max(charFrames, Math.min(Math.round(fps * 0.12), Math.floor((available * 1.25) / Math.max(1, line.text.length))));
    if (fx === 'backspace') {
      const lastSpace = Math.max(line.text.lastIndexOf('('), line.text.lastIndexOf('.'), line.text.lastIndexOf(' '));
      del = Math.max(2, line.text.length - (lastSpace + 1));
      hold = Math.round(fps * 0.3);
      const need = line.text.length * charFrames + hold + del * Math.max(1, Math.round(charFrames / 2)) + del * charFrames;
      if (need > available + fps * 0.6) fx = 'none';
    }
    // A held note may run past the usual 2.6 s typing budget: it only has to finish before the next line (or the cut).
    const holdDeadline = next ? Math.round(next.at * fps) - Math.round(fps * 0.3) : durationInFrames - Math.round(fps * 0.4);
    const stretch = fx === 'backspace' ? null : planStretch(line.hold ?? null, line.text, startFrame, charFrames, holdDeadline, fps);
    plans.push({ startFrame, charFrames, text: line.text, lineIndex: i, speaker: line.speaker, fx, del: fx === 'backspace' ? del : 0, hold: fx === 'backspace' ? hold : 0, typo: null, stretch });
    room.push(available);
  });
  // Someone is really typing: at most one typo per scene (two scenes in three), on the line with the
  // most room for the fix, so the words still land on the vocal.
  // A missed Turkish letter (gulüyorsun -> gülüyorsun) always wins; plain slips only in two scenes of three.
  const sceneHash = hashStr(scene.lines.map((l) => l.text).join('|'));
  let best: { i: number; typo: Typo; slack: number; twin: boolean } | null = null;
  plans.forEach((pl, i) => {
    if (pl.fx === 'backspace' || pl.stretch || pl.startFrame < 0) return;
    const t = pickTypo(pl.text, fps, String(i));
    if (!t) return;
    const twin = TWIN[pl.text[t.at]!] === t.wrong && pl.text[t.at] !== 'i';
    const delCf = Math.max(1, Math.round(pl.charFrames / 2));
    for (const run of [t.run, 0]) {
      const need = (pl.text.length + run + 1) * pl.charFrames + t.hold + (run + 1) * delCf + t.gap;
      const slack = room[i]! - need;
      if (slack < 0) continue;
      const better = !best || (twin && !best.twin) || (twin === best.twin && slack > best.slack);
      if (better) best = { i, typo: { ...t, run }, slack, twin };
      break;
    }
  });
  const pick = best as { i: number; typo: Typo; twin: boolean } | null;
  if (pick && (pick.twin || sceneHash % 3 !== 0)) plans[pick.i]!.typo = pick.typo;
  return plans;
}

/** Turn a sung hold into typing: only when the note is long enough and the line still finishes in time. */
function planStretch(hold: { char: number; s: number; e: number } | null, text: string, startFrame: number, cf: number, deadline: number, fps: number): Stretch | null {
  if (!hold || startFrame < 0) return null;
  const at = hold.char;
  const ch = text[at];
  if (!ch || !/[aeıioöuüâîû]/iu.test(ch)) return null;
  const vowelAt = startFrame + at * cf;
  const from = Math.max(vowelAt + cf, Math.round(hold.s * fps));
  const to = Math.round(hold.e * fps);
  if (to - from < Math.round(fps * 0.35)) return null;
  const n = Math.max(2, Math.min(7, Math.round((to - from) / (fps * 0.12))));
  const collapseAt = to + (text.length - at - 1) * cf + 5;
  const done = collapseAt + Math.ceil(n / 2);
  if (done > deadline) return null;
  return { at, ch, n, from, to, collapseAt };
}

/** Pure function used by calculateMetadata, the React tree and the Node audio synth. */
export function computeTimeline(storyboard: Storyboard, fps: number): Timeline {
  const totalSec = storyboard.scenes.reduce((a, s) => a + s.durationSec, 0);
  const totalFrames = Math.round(totalSec * fps);

  const raw = storyboard.scenes.map((s) => Math.round(s.durationSec * fps));
  // Fix rounding drift so the sum is exactly totalFrames.
  const drift = totalFrames - raw.reduce((a, b) => a + b, 0);
  if (raw.length > 0) raw[raw.length - 1] = (raw[raw.length - 1] as number) + drift;

  let cursor = 0;
  const scenes: SceneTiming[] = storyboard.scenes.map((scene, index) => {
    const durationInFrames = raw[index] as number;
    const timing: SceneTiming = {
      index,
      type: scene.type,
      from: cursor,
      durationInFrames,
      typing: typingPlan(scene, durationInFrames, fps, storyboard.audio.typingDensity),
      lyrics: lyricPlans(scene, durationInFrames, fps, storyboard.audio.beatSec ?? null),
    };
    cursor += durationInFrames;
    return timing;
  });

  // At most three typos per reel, 6 s apart, Turkish-letter slips first, so it reads as a person, not a gimmick.
  const typoAt = scenes.flatMap((s) => s.lyrics.filter((p) => p.typo).map((p) => ({ p, f: s.from + p.startFrame + p.typo!.at * p.charFrames, twin: TWIN[p.text[p.typo!.at]!] === p.typo!.wrong })));
  typoAt.sort((a, b) => Number(b.twin) - Number(a.twin) || a.f - b.f);
  const kept: number[] = [];
  for (const c of typoAt) {
    if (kept.length < 3 && kept.every((f) => Math.abs(f - c.f) >= fps * 6)) kept.push(c.f);
    else c.p.typo = null;
  }

  const cuts = scenes.slice(1).map((s) => s.from);
  const typingFrames: number[] = [];
  for (const s of scenes) {
    const plans: TypingPlan[] = s.typing ? [s.typing, ...s.lyrics] : s.lyrics;
    for (const plan of plans) {
      for (const lf of keyFrames(plan)) {
        const f = s.from + lf;
        if (f >= s.from && f < s.from + s.durationInFrames) typingFrames.push(f);
      }
    }
  }

  return { fps, totalFrames, scenes, cuts, typingFrames };
}

const isLyric = (p: TypingPlan): p is LyricPlan => (p as LyricPlan).fx !== undefined;

/** `x`: extra held-note letters on the line right after the stretch point. */
export type KeyEvent = { f: number; s: string; x?: number };
const eventCache = new WeakMap<TypingPlan, KeyEvent[]>();

/** Every keystroke of a plan with what the line shows right after it (typing, typos, backspaces). */
export function typingEvents(plan: TypingPlan): KeyEvent[] {
  const hit = eventCache.get(plan);
  if (hit) return hit;
  const { text, startFrame: f0, charFrames: cf } = plan;
  const n = text.length;
  const ev: KeyEvent[] = [];
  const lyric = isLyric(plan) ? plan : null;
  const delCf = Math.max(1, Math.round(cf / 2));
  if (lyric?.typo) {
    const { at, wrong, run, hold, gap } = lyric.typo;
    for (let i = 0; i < at; i++) ev.push({ f: f0 + i * cf, s: text.slice(0, i + 1) });
    let f = f0 + at * cf;
    let cur = text.slice(0, at) + wrong;
    ev.push({ f, s: cur });
    for (let j = 1; j <= run; j++) {
      f += cf;
      cur += text[at + j]!;
      ev.push({ f, s: cur });
    }
    f += hold;
    for (let k = 0; k <= run; k++) {
      cur = cur.slice(0, -1);
      ev.push({ f, s: cur });
      f += delCf;
    }
    f += gap;
    for (let i = at; i < n; i++) {
      ev.push({ f, s: text.slice(0, i + 1) });
      f += cf;
    }
  } else if (lyric?.stretch) {
    const { at, ch, n: extra, from, to, collapseAt } = lyric.stretch;
    const head = text.slice(0, at + 1);
    for (let i = 0; i <= at; i++) ev.push({ f: f0 + i * cf, s: text.slice(0, i + 1) });
    const step = (to - from) / extra;
    for (let j = 1; j <= extra; j++) ev.push({ f: from + Math.round((j - 1) * step), s: head + ch.repeat(j), x: j });
    for (let i = at + 1; i < n; i++) ev.push({ f: to + (i - at - 1) * cf, s: head + ch.repeat(extra) + text.slice(at + 1, i + 1), x: extra });
    // The held letters squeeze back out, two per frame.
    for (let c = extra - 2, k = 0; ; c -= 2, k++) {
      const left = Math.max(0, c);
      ev.push({ f: collapseAt + k, s: head + ch.repeat(left) + text.slice(at + 1), x: left });
      if (left === 0) break;
    }
  } else {
    for (let i = 0; i < n; i++) ev.push({ f: f0 + i * cf, s: text.slice(0, i + 1) });
    if (lyric && lyric.fx === 'backspace') {
      const t0 = f0 + n * cf + lyric.hold;
      for (let i = 0; i < lyric.del; i++) ev.push({ f: t0 + i * delCf, s: text.slice(0, n - 1 - i) });
      const t1 = t0 + lyric.del * delCf + Math.round(lyric.hold / 2);
      for (let i = 0; i < lyric.del; i++) ev.push({ f: t1 + i * cf, s: text.slice(0, n - lyric.del + i + 1) });
    }
  }
  eventCache.set(plan, ev);
  return ev;
}

/** Scene-local frames where a key is pressed (typing, deleting, retyping). */
export function keyFrames(plan: TypingPlan): number[] {
  return typingEvents(plan).map((e) => e.f);
}

function eventAt(plan: TypingPlan, localFrame: number): KeyEvent | null {
  let hit: KeyEvent | null = null;
  for (const e of typingEvents(plan)) {
    if (e.f > localFrame) break;
    hit = e;
  }
  return hit;
}

/** The line without held-note letters (what the text "really" says so far). */
function plain(plan: TypingPlan, e: KeyEvent): string {
  const st = isLyric(plan) ? plan.stretch : null;
  return st && e.x ? e.s.slice(0, st.at + 1) + e.s.slice(st.at + 1 + e.x) : e.s;
}

const matched = (plan: TypingPlan, s: string) => {
  let i = 0;
  while (i < s.length && s[i] === plan.text[i]) i++;
  return i;
};

/** What the line shows at a scene-local frame, typos and held letters included. */
export function typedText(plan: TypingPlan | null, localFrame: number): string {
  if (!plan) return '';
  return eventAt(plan, localFrame)?.s ?? '';
}

/** Held-note letters on the line at a scene-local frame (0 when none). */
export function stretchExtras(plan: TypingPlan | null, localFrame: number): number {
  if (!plan) return 0;
  return eventAt(plan, localFrame)?.x ?? 0;
}

/** Characters of the final text that are correctly on screen at a scene-local frame. */
export function typedCount(plan: TypingPlan | null, localFrame: number): number {
  if (!plan) return 0;
  const e = eventAt(plan, localFrame);
  return e ? matched(plan, plain(plan, e)) : 0;
}

/** First scene-local frame where the first `k` characters are correctly on screen. */
export function charFrame(plan: TypingPlan, k: number): number {
  for (const e of typingEvents(plan)) if (matched(plan, plain(plan, e)) >= k) return e.f;
  return doneFrame(plan);
}

/** Frame (scene-local) when the line is final: typed, and for backspace lines retyped. */
export function doneFrame(plan: TypingPlan): number {
  const k = typingEvents(plan);
  return k[k.length - 1]?.f ?? plan.startFrame;
}

/** Frames a reveal twist waits so the lyric line typed in the reveal can finish first (0 when none). */
export function twistDelayFrames(scene: Scene, plans: LyricPlan[], fps: number, pressSec: number): number {
  if (scene.type !== 'lyricEditor' || !scene.reveal || !scene.twist || scene.twist.kind === 'join' || plans.length === 0) return 0;
  const last = plans[plans.length - 1]!;
  // Wait for the typing and for the sung phrase (~1.9 s), whichever ends later.
  return Math.max(0, Math.max(doneFrame(last) + 3, last.startFrame + Math.round(fps * 1.9)) - Math.round(pressSec * fps));
}
