import type { WireStoryboard } from '../schema/storyboard';
import { CUT_KINDS, LIMITS } from '../schema/storyboard';
import { hashString, rng } from '../lib/seed';
import { codifyLine } from './codify';
import { cuesForLine, fold } from './lexicon';
import type { LyricLine } from './lrc';
import type { Story } from './story';
import { snapToBeat } from '../audio/beat';
import type { StudioConfig } from '../lib/studio';
import type { SignatureKind } from '../schema/storyboard';
import { tokenize } from '../editor/highlight';
import { signatureChar } from './signature';

/** Per-word timings from tools/align (Whisper), absolute song seconds. */
export type WordTimes = { lines: { t: number; text: string; words: { w: string; s: number; e: number }[] }[] };

export type Cue = ReturnType<typeof cuesForLine>[number];
/** Optional code written by Claude, keyed by the original lyric text. */
export type Codified = Record<string, { code: string[]; cues: Cue[] }>;

export type SongboardInput = {
  title: string;
  artist: string;
  names: string[];
  /** Every lyric line of the song (used for chorus detection), absolute times. */
  lyrics: LyricLine[];
  start: number;
  seconds: number;
  beatSec: number;
  firstBeat: number;
  story: Story | null;
  studio: StudioConfig;
  /** Reel times of energy jumps; the scene nearest each gets a focus-pull + flash entrance. */
  drops?: number[];
  codified?: Codified | null;
  seed?: number;
  filename?: string;
  /** Word timings for held notes (optional: without them nothing is stretched). */
  words?: WordTimes | null;
  /** The song's signature effect, already picked ('none' for no effect). */
  signature?: SignatureKind | 'none';
};

type Fx = 'none' | 'slow' | 'backspace' | 'predict';
type Hold = { char: number; s: number; e: number };
type Live = { text: string; at: number; speaker: number; comment: string | null; cues: Cue[]; fx: Fx; raw: string | null; hold?: Hold | null; diff?: string | null; find?: { word: string; char: number } | null; sig?: { kind: SignatureKind; char: number } | null };

const VOWELS = /[aeıioöuüâîû]/iu;

/**
 * Held notes: a sung word much longer than the song's typical word (and at least 0.8 s). Whisper's end
 * times run long on a word before a pause, so only clear outliers count, and at most one per line.
 */
function heldWord(lyric: { t: number; text: string }, wt: WordTimes | null | undefined, median: number): { w: string; s: number; e: number } | null {
  if (!wt) return null;
  const key = fold(lyric.text);
  const line = wt.lines.filter((l) => fold(l.text) === key).sort((a, b) => Math.abs(a.t - lyric.t) - Math.abs(b.t - lyric.t))[0];
  if (!line || Math.abs(line.t - lyric.t) > 4) return null;
  let best: { w: string; s: number; e: number } | null = null;
  // Held notes end phrases: only the last two words of a line (a long first word is usually a timing error).
  for (const w of line.words.slice(-2)) {
    const d = w.e - w.s;
    if (d >= 0.8 && d <= 3.5 && d >= median * 2.4 && VOWELS.test(w.w) && (!best || d > best.e - best.s)) best = w;
  }
  return best;
}

/** Where in the code fragments the held word sits: its last vowel. */
function holdChar(parts: string[], word: string): { part: number; char: number } | null {
  const w = fold(word).replace(/[^a-z0-9]/g, '');
  if (!w) return null;
  for (let p = parts.length - 1; p >= 0; p--) {
    const f = fold(parts[p]!);
    const k = f.lastIndexOf(w);
    if (k < 0) continue;
    for (let c = k + w.length - 1; c >= k; c--) if (VOWELS.test(parts[p]![c]!)) return { part: p, char: c };
  }
  return null;
}

const idents = (line: string) => tokenize(line).filter((t) => t.kind === 'ident' || t.kind === 'call' || t.kind === 'keyword').map((t) => t.text);

/** Hesitation / regret vocabulary: these lines get typed, partly deleted, and retyped. */
const HESITATE = /^(keske|belki|yalan|sanki|aslinda|unut|sil|vazgec|ozur|pardon|sorry|maybe|lie)/;
type LyricScene = Extract<WireStoryboard['scenes'][number], { type: 'lyricEditor' }>;
type CutKind = (typeof CUT_KINDS)[number];

/** "poizi: text" or "(poizi) text" at the start of an LRC line assigns the cursor. */
export function splitSpeaker(text: string, names: string[]): { speaker: number | null; text: string } {
  const m = text.match(/^\s*(?:\(([^)]+)\)|([\p{L}\p{N}_.-]+)\s*:)\s*(.+)$/u);
  if (!m) return { speaker: null, text };
  const who = fold((m[1] ?? m[2] ?? '').trim());
  const idx = names.findIndex((n) => fold(n) === who);
  return idx === -1 ? { speaker: null, text } : { speaker: idx, text: (m[3] ?? '').trim() };
}

/**
 * Lyric-as-code storyboard. Chorus lines (lines that recur in the song) cut on every line; verse lines
 * cut every two. Cuts land on the beat just before the vocal. Story notes sit beside the code and the
 * twist is typed under the finished file in the reveal.
 */
export function buildSongStoryboard(input: SongboardInput): WireStoryboard {
  const seed = input.seed ?? hashString(`${input.artist} ${input.title} ${input.start}`);
  const r = rng(seed, 'songboard');
  const names = input.names.slice(0, 2);
  const filename = input.filename ?? `${slug(input.title)}.${input.studio.filenameExt}`;

  const counts = new Map<string, number>();
  for (const l of input.lyrics) {
    const k = fold(splitSpeaker(l.text, names).text);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const inWindow = input.lyrics.filter((l) => l.t >= input.start && l.t < input.start + input.seconds - 0.8 && l.text.trim().length > 0);
  const allDur = (input.words?.lines ?? []).flatMap((l) => l.words.map((w) => w.e - w.s)).sort((a, b) => a - b);
  const medianWord = allDur.length ? allDur[Math.floor(allDur.length / 2)]! : 0.3;

  type Group = { lives: Live[]; chorus: boolean };
  const groups: Group[] = inWindow.map((lyric, i) => {
    const next = inWindow[i + 1];
    const gap = next ? next.t - lyric.t : 3.5;
    const split = splitSpeaker(lyric.text, names);
    const chorus = (counts.get(fold(split.text)) ?? 0) >= 2;
    // Who sings it: an inline "poizi:" tag, else the section header in the LRC, else the lead artist.
    // Never guess: a wrong cursor name on a line is a wrong fact.
    const fromHeader = lyric.singer ? names.findIndex((n) => fold(lyric.singer!).includes(fold(n))) : -1;
    const speaker = split.speaker ?? (fromHeader >= 0 ? fromHeader : 0);
    const claude = input.codified?.[lyric.text] ?? input.codified?.[split.text];
    const parts = (claude?.code.length ? claude.code : codifyLine(split.text)).slice(0, 4);
    const step = Math.min(gap / Math.max(1, parts.length), 1.1);
    const hesitant = split.text.split(/\s+/).some((w) => HESITATE.test(fold(w).replace(/[^a-z]/g, '')));
    const lives = parts.map((text, k) => ({
      text,
      at: lyric.t - input.start + k * step - (i === 0 && k === 0 ? 0.9 : 0),
      speaker,
      comment: null,
      fx: (chorus ? 'predict' : hesitant && k === parts.length - 1 ? 'backspace' : 'none') as Fx,
      raw: k === 0 ? split.text : null,
      cues: claude ? claude.cues.filter((c) => text.includes(c.word)).map((c) => ({ ...c, char: text.indexOf(c.word) + c.word.length })) : cuesForLine(text),
      hold: null as Hold | null,
    }));
    const held = heldWord(lyric, input.words, medianWord);
    const at = held ? holdChar(parts, held.w) : null;
    if (held && at) lives[at.part]!.hold = { char: at.char, s: held.s + 0.15 - input.start, e: held.e - input.start };
    return { lives, chorus };
  });

  const twist0 = input.story?.twist ?? null;
  // Join twist: the second artist's next part, the first line after the reel that is theirs
  // (from the LRC section headers; without headers, simply the next line after the reel).
  let joinLine: string | null = null;
  if (twist0?.kind === 'join' && names.length > 1) {
    const after = input.lyrics.filter((l) => l.t >= input.start + input.seconds - 0.8 && l.text.trim());
    const hasHeaders = input.lyrics.some((l) => l.singer);
    const theirs = after.find((l) => (hasHeaders ? !!l.singer && fold(l.singer).includes(fold(names[1]!)) : true));
    if (theirs) {
      const text = splitSpeaker(theirs.text, names).text;
      const claude = input.codified?.[theirs.text] ?? input.codified?.[text];
      joinLine = (claude?.code.length ? claude.code : codifyLine(text))[0] ?? null;
    }
  }
  const twist = twist0?.kind === 'join' && !joinLine ? null : twist0;
  // The reel fades to black over its last ~1.1 s; the reveal gets an extra second so the twist can breathe.
  const revealSec = (twist ? (twist.kind === 'comment' ? 3.6 : 4.4) : 2.4) + 1.0;
  const bodyEnd = input.seconds - revealSec;
  type Draft = { start: number; lives: Live[] };
  const drafts: Draft[] = [];
  let verseCount = 0;
  groups.forEach((g) => {
    const first = g.lives[0]!;
    const cur = drafts[drafts.length - 1];
    const long = cur ? first.at - cur.start > 4.0 : false;
    const newScene = drafts.length === 0 || g.chorus || verseCount % 2 === 0 || long;
    verseCount = g.chorus ? 0 : verseCount + 1;
    if (newScene) {
      const lead = snapToBeat(input.start + first.at - 0.15, input.beatSec, input.firstBeat, 'floor') - input.start;
      const prev = drafts[drafts.length - 1];
      const startAt = drafts.length === 0 ? 0 : Math.max(lead, prev!.start + 1.6);
      if (drafts.length > 0 && startAt >= first.at + 0.4) {
        prev!.lives.push(...g.lives); // too close to cut cleanly: keep it in the current scene
        return;
      }
      drafts.push({ start: startAt, lives: [] });
    }
    drafts[drafts.length - 1]!.lives.push(...g.lives);
  });
  const kept = drafts.filter((d) => d.start < bodyEnd - 1.2).slice(0, LIMITS.maxLyricScenes - 1);
  if (kept.length === 0) kept.push({ start: 0, lives: [] });
  const sceneEnd = (i: number) => (i + 1 < kept.length ? kept[i + 1]!.start : bodyEnd);

  // Story notes: timed ones go to the scene containing their time; untimed ones are spread over the body.
  const notes = input.story?.notes ?? [];
  const untimed = notes.filter((n) => n.at === null);
  const sceneNotes: { text: string; at: number }[][] = kept.map(() => []);
  for (const n of notes) {
    if (n.at === null) continue;
    const i = Math.max(0, kept.findIndex((d, k) => n.at! >= d.start && n.at! < sceneEnd(k)));
    sceneNotes[i]!.push({ text: n.text, at: Math.max(0.3, n.at - kept[i]!.start) });
  }
  untimed.forEach((n, k) => {
    const i = Math.min(kept.length - 1, Math.floor(((k + 0.5) / untimed.length) * kept.length));
    const d = kept[i]!;
    const dur = sceneEnd(i) - d.start;
    const lastLine = d.lives[d.lives.length - 1];
    sceneNotes[i]!.push({ text: n.text, at: Math.max(0.3, Math.min(dur - 0.6, lastLine ? lastLine.at - d.start + 1.2 : dur * 0.5)) });
  });

  // Drops get the big entrance.
  const dropScene = new Set<number>();
  for (const t of input.drops ?? []) {
    let best = -1;
    let bestD = 1e9;
    kept.forEach((d, i) => {
      const dd = Math.abs(d.start - t);
      if (i > 0 && dd < bestD) {
        bestD = dd;
        best = i;
      }
    });
    if (best > 0 && bestD < 1.2) dropScene.add(best);
  }

  const props = input.studio.props.length > 0 ? input.studio.props : ['none'];
  const tilts = [7, -6, 9, -8, 6, -5, 8];
  const scenes: LyricScene[] = [];
  const typedSoFar: string[] = [];
  const chorusSoFar: boolean[] = [];
  const used = new Set<Live>();
  kept.forEach((d, i) => {
    const durationSec = Math.max(1.5, sceneEnd(i) - d.start);
    const picked = d.lives.filter((l) => (i === 0 ? Math.max(-1.2, l.at - d.start) : Math.max(0, l.at - d.start)) < durationSec - 0.3).slice(0, LIMITS.maxLyricLines);
    picked.forEach((l) => used.add(l));
    const lines = picked.map((l) => ({ ...l, at: i === 0 ? Math.max(-1.2, l.at - d.start) : Math.max(0, l.at - d.start), hold: l.hold ? { char: l.hold.char, s: l.hold.s - d.start, e: l.hold.e - d.start } : null }));
    const zoom = 2.55 + r() * 0.35;
    const prop = props[i % props.length] as LyricScene['prop'];
    const cutIn: CutKind = i === 0 ? 'none' : dropScene.has(i) ? 'flash' : 'auto';
    scenes.push({
      type: 'lyricEditor',
      durationSec,
      filename,
      names,
      before: [...typedSoFar],
      lines,
      prop,
      reveal: false,
      cutIn,
      twist: null,
      notes: sceneNotes[i]!.slice(0, 2),
      camera: { zoomFrom: zoom, zoomTo: zoom + 0.25, panFrom: { x: -0.3, y: 0 }, panTo: { x: -0.2, y: 0 }, tiltDeg: tilts[i % tilts.length]!, focusFrom: 0.85, focusTo: 1 },
      effects: { grain: 0.5, lightLeak: i % 3 === 2 ? 0.55 : 0.25, dust: 0.3, stars: prop === 'stars' ? 0.8 : 0, aberration: 0.45, vignette: 0.7 },
    });
    typedSoFar.push(...lines.map((l) => l.text));
    chorusSoFar.push(...lines.map((l) => l.fx === 'predict'));
  });
  markEditorMoments(scenes, kept.map((d) => d.start), names, input.signature ?? 'none');

  // Lines sung after the body ends are typed in the reveal before the twist lands (file-editing twists only),
  // so the reel never drops the line the song is on. Stop early enough for the twist and the end card.
  const tailRoom = revealSec - 1.0 - 2.4;
  const tail =
    twist && twist.kind !== 'comment' && twist.kind !== 'join'
      ? groups
          .flatMap((g) => g.lives)
          .filter((l) => !used.has(l) && l.at >= bodyEnd - 1.5 && l.at < bodyEnd + tailRoom)
          .slice(0, 1)
          .map((l) => ({ ...l, at: Math.max(0.3, l.at - bodyEnd) }))
      : [];
  // Reveal: verses fold into one line each so the chorus and the twist get the room.
  const revealBefore = typedSoFar.slice(-LIMITS.maxBeforeLines);
  const flags = chorusSoFar.slice(-LIMITS.maxBeforeLines);
  const folds: { from: number; to: number; label: string }[] = [];
  if (flags.some(Boolean) && twist?.kind !== 'replace') {
    let n = 0;
    for (let a = 0; a < flags.length; ) {
      if (flags[a]) {
        a++;
        continue;
      }
      let b = a;
      while (b < flags.length && !flags[b]) b++;
      n++;
      if (b - a >= 3) folds.push({ from: a, to: b, label: `▸ verse${n}() { … }` });
      a = b;
    }
  }
  scenes.push({
    type: 'lyricEditor',
    durationSec: revealSec,
    filename,
    names,
    folds: folds.length ? folds : null,
    before: revealBefore,
    lines: twist && twist.kind === 'comment' ? [{ text: `// ${twist.text}`.slice(0, LIMITS.maxLyricChars), at: 0.5, speaker: 0, comment: null, cues: [], fx: 'slow', raw: null }] : twist && twist.kind === 'join' && joinLine ? [{ text: joinLine, at: 1.3, speaker: 1, comment: null, cues: [], fx: 'slow', raw: null }] : tail,
    twist: twist && twist.kind !== 'comment' ? { kind: twist.kind, text: twist.text, from: twist.from, to: twist.to, log: (input.story?.notes ?? []).map((n) => n.text) } : null,
    prop: 'none',
    reveal: true,
    cutIn: 'focusPull',
    notes: [],
    camera: { zoomFrom: 1.12, zoomTo: 1.24, panFrom: { x: 0, y: 0 }, panTo: { x: 0, y: 0 }, tiltDeg: 2, focusFrom: 1, focusTo: 1 },
    effects: { grain: 0.5, lightLeak: 0.3, dust: 0.3, stars: 0, aberration: 0.3, vignette: 0.7 },
  });

  typedSoFar.push(...tail.map((l) => l.text));
  const lines = typedSoFar.slice(0, LIMITS.maxLines);
  while (lines.length < LIMITS.minLines) lines.push(`// ${input.title}`.slice(0, LIMITS.maxLineChars));

  return {
    id: slug(`${input.artist}-${input.title}`),
    topic: `${input.artist} - ${input.title}`,
    seed,
    title: input.title.slice(0, 40),
    concept: `Lyrics of "${input.title}" by ${input.artist} typed as code in sync with the vocals, cut on the beat${twist ? ', ending on a twist' : ''}.`,
    palette: { ...input.studio.palette },
    brand: input.studio.name || null,
    lines,
    scenes,
    audio: { mood: 'warm', typingDensity: 0.5, musicFile: null, beatSec: input.beatSec, beatOffset: ((input.firstBeat - input.start) % input.beatSec + input.beatSec) % input.beatSec },
    transitions: input.studio.transitions,
  };
}

/**
 * Editor moments, each at most once per reel and never two on one line:
 *  - signature: the first time the word that names the song's effect is typed
 *  - find: the chorus word, searched once it is on screen four times or more (from ~6 s in)
 *  - diff: a line that rewrites an earlier one (three words or more, exactly one changed) shows the old version above it
 *  - split: a duet scene (both singers trade lines) gets two panes
 */
function markEditorMoments(scenes: LyricScene[], starts: number[], names: string[], signature: SignatureKind | 'none') {
  type L = LyricScene['lines'][number] & { hold?: unknown; diff?: string | null; find?: { word: string; char: number } | null; sig?: { kind: SignatureKind; char: number } | null };
  const busy = (l: L) => !!(l.sig || l.find || l.diff);
  if (signature !== 'none' && signature !== 'yinyang') {
    outer: for (const [si, sc] of scenes.entries()) {
      for (const l of sc.lines as L[]) {
        const c = signatureChar(signature, l.text);
        if (c > 0 && (si > 0 || starts[si]! + l.at > 1.5)) {
          l.sig = { kind: signature, char: c };
          break outer;
        }
      }
    }
  }
  // Chorus word: the most typed word, four or more times.
  const counts = new Map<string, number>();
  for (const sc of scenes) for (const l of sc.lines) for (const w of idents(l.text)) if (/\p{L}{3,}/u.test(w) && !/^(if|else|while|for|return|const|let|function|true|false|null)$/.test(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 4) {
    let seen = 0;
    outer: for (const [si, sc] of scenes.entries()) {
      for (const l of sc.lines as L[]) {
        const hits = idents(l.text).filter((w) => w === top[0]).length;
        seen += hits;
        if (hits && seen >= 4 && si > 0 && starts[si]! + l.at >= 6 && !busy(l)) {
          const tok = tokenize(l.text);
          let pos = 0;
          for (const t of tok) {
            if (t.text === top[0]) break;
            pos += t.text.length;
          }
          l.find = { word: top[0], char: pos + top[0].length };
          break outer;
        }
      }
    }
  }
  // Rewrites: same words except exactly one.
  const earlier: string[] = [];
  outer: for (const [si, sc] of scenes.entries()) {
    for (const l of sc.lines as L[]) {
      const a = idents(l.text);
      if (si > 0 && starts[si]! + l.at >= 5 && a.length >= 3 && !busy(l)) {
        for (const old of [...earlier].reverse()) {
          const b = idents(old);
          if (old === l.text || b.length !== a.length) continue;
          if (a.filter((w, k) => w !== b[k]).length === 1) {
            l.diff = old;
            break outer;
          }
        }
      }
      earlier.push(l.text);
    }
  }
  // Duet: both singers trade lines in one scene.
  if (names.length === 2) {
    for (const [si, sc] of scenes.entries()) {
      if (si === 0) continue;
      const sp = sc.lines.map((l) => l.speaker);
      const switches = sp.filter((v, k) => k > 0 && v !== sp[k - 1]).length;
      if (switches >= 2 && sp.filter((v) => v === 0).length >= 2 && sp.filter((v) => v === 1).length >= 2) {
        (sc as LyricScene & { split?: boolean }).split = true;
        break;
      }
    }
  }
}

function slug(s: string): string {
  return (
    s
      .toLocaleLowerCase('tr')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'song'
  );
}

/** Pattern break near 3 s when no cut lands there (retention dips around the third second). */
export function computeBreaks(sb: WireStoryboard, beatSec: number, beatOffset: number): number[] {
  let t = 0;
  const cuts: number[] = [];
  for (const s of sb.scenes) {
    if (t > 0) cuts.push(t);
    t += s.durationSec;
  }
  if (cuts.some((c) => c >= 2.4 && c <= 3.8)) return [];
  const k = Math.round((3.0 - beatOffset) / beatSec);
  return [Math.max(2.4, Math.min(3.8, beatOffset + k * beatSec))];
}
