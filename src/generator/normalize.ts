import { LIMITS, StrictSchema, type Camera, type Effects, type Scene, type SceneType, type Storyboard, type WireStoryboard } from '../schema/storyboard';
import { hashString } from '../lib/seed';

export type NormalizeOptions = {
  /** Target total duration in seconds (clamped to LIMITS.minDuration..maxDuration). */
  targetDuration?: number;
  /** Force a seed regardless of what the storyboard says. */
  seed?: number;
  brand?: string | null;
  hero?: Storyboard['hero'];
  song?: Storyboard['song'];
  /** Per-frame music level 0..1 for audio-reactive visuals. */
  levels?: number[] | null;
  extra?: Pick<Storyboard, 'vibe' | 'kicks' | 'snares' | 'signature' | 'breaks' | 'hook' | 'ending' | 'episode'>;
};

const DEFAULT_CAMERA: Record<SceneType, Camera> = {
  lyricEditor: { zoomFrom: 2.7, zoomTo: 2.9, panFrom: { x: -0.35, y: 0 }, panTo: { x: -0.25, y: 0 }, tiltDeg: 7, focusFrom: 1, focusTo: 1 },
  codeEditor: { zoomFrom: 2.6, zoomTo: 3.1, panFrom: { x: -0.3, y: -0.2 }, panTo: { x: 0.1, y: 0.1 }, tiltDeg: 9, focusFrom: 0.6, focusTo: 1 },
  macroCode: { zoomFrom: 3.8, zoomTo: 4.3, panFrom: { x: 0, y: 0 }, panTo: { x: 0.1, y: 0 }, tiltDeg: -7, focusFrom: 0.3, focusTo: 1 },
  insect: { zoomFrom: 2.4, zoomTo: 2.8, panFrom: { x: -0.2, y: -0.3 }, panTo: { x: 0.2, y: 0.1 }, tiltDeg: 14, focusFrom: 0.9, focusTo: 0.8 },
  sunset: { zoomFrom: 1, zoomTo: 1.15, panFrom: { x: 0, y: 0 }, panTo: { x: 0, y: -0.1 }, tiltDeg: 0, focusFrom: 1, focusTo: 1 },
  ambient: { zoomFrom: 2.2, zoomTo: 2.6, panFrom: { x: 0.2, y: 0.2 }, panTo: { x: -0.2, y: -0.1 }, tiltDeg: -12, focusFrom: 0.1, focusTo: 0.35 },
  typography: { zoomFrom: 1, zoomTo: 1.08, panFrom: { x: 0, y: 0 }, panTo: { x: 0, y: 0 }, tiltDeg: 4, focusFrom: 0.8, focusTo: 1 },
};

const DEFAULT_EFFECTS: Record<SceneType, Effects> = {
  lyricEditor: { grain: 0.5, lightLeak: 0.3, dust: 0.3, stars: 0, aberration: 0.45, vignette: 0.7 },
  codeEditor: { grain: 0.5, lightLeak: 0.25, dust: 0.3, stars: 0, aberration: 0.4, vignette: 0.7 },
  macroCode: { grain: 0.55, lightLeak: 0.15, dust: 0.2, stars: 0, aberration: 0.7, vignette: 0.75 },
  insect: { grain: 0.5, lightLeak: 0.1, dust: 0.4, stars: 0.8, aberration: 0.3, vignette: 0.7 },
  sunset: { grain: 0.6, lightLeak: 0.5, dust: 0.5, stars: 0.1, aberration: 0.3, vignette: 0.8 },
  ambient: { grain: 0.6, lightLeak: 0.7, dust: 0.6, stars: 0.2, aberration: 0.2, vignette: 0.8 },
  typography: { grain: 0.5, lightLeak: 0.3, dust: 0.3, stars: 0, aberration: 0.5, vignette: 0.75 },
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));

/** ASCII only (emoji fall back to platform fonts and break determinism), collapse whitespace, cap length. */
export function cleanLine(line: string, max: number): string {
  // Printable ASCII plus Latin-1 / Latin Extended letters (Turkish, German, ...). Emoji and symbols are dropped.
  const ascii = line.replace(/[^\x20-\x7e\u00C0-\u024F]/g, '').replace(/\s+/g, ' ').trimEnd();
  return ascii.length > max ? ascii.slice(0, max).trimEnd() : ascii;
}

function cleanLines(lines: readonly string[] | null | undefined, maxItems: number, maxChars: number, fallback: string[]): string[] {
  const out = (lines ?? []).map((l) => cleanLine(l, maxChars)).filter((l, i, arr) => l.length > 0 || (i > 0 && i < arr.length - 1));
  const trimmed = out.slice(0, maxItems);
  return trimmed.length > 0 ? trimmed : fallback;
}

function normCamera(c: Partial<Camera> | null | undefined, type: SceneType): Camera {
  const d = DEFAULT_CAMERA[type];
  return {
    zoomFrom: clamp(c?.zoomFrom ?? d.zoomFrom, 1, 4.5),
    zoomTo: clamp(c?.zoomTo ?? d.zoomTo, 1, 4.5),
    panFrom: { x: clamp(c?.panFrom?.x ?? d.panFrom.x, -1, 1), y: clamp(c?.panFrom?.y ?? d.panFrom.y, -1, 1) },
    panTo: { x: clamp(c?.panTo?.x ?? d.panTo.x, -1, 1), y: clamp(c?.panTo?.y ?? d.panTo.y, -1, 1) },
    tiltDeg: clamp(c?.tiltDeg ?? d.tiltDeg, -25, 25),
    focusFrom: clamp(c?.focusFrom ?? d.focusFrom, 0, 1),
    focusTo: clamp(c?.focusTo ?? d.focusTo, 0, 1),
  };
}

function normEffects(e: Partial<Effects> | null | undefined, type: SceneType): Effects {
  const d = DEFAULT_EFFECTS[type];
  const keys = Object.keys(d) as (keyof Effects)[];
  const out = { ...d };
  for (const k of keys) out[k] = clamp(e?.[k] ?? d[k], 0, 1);
  return out;
}

function hexOr(v: string | null | undefined, fallback: string): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : fallback;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'reel';
}

type WireScene = WireStoryboard['scenes'][number];

function normScene(raw: WireScene, lines: string[]): Scene {
  const maxSec = raw.type === 'lyricEditor' ? LIMITS.maxLyricSceneSec : 8;
  const base = {
    durationSec: clamp(raw.durationSec, 1.5, maxSec),
    camera: normCamera(raw.camera, raw.type),
    effects: normEffects(raw.effects, raw.type),
  };
  const L = LIMITS;
  switch (raw.type) {
    case 'lyricEditor': {
      const names = (raw.names ?? []).map((n) => cleanLine(n, 14)).filter(Boolean).slice(0, 2);
      const lines = (raw.lines ?? [])
        .map((l) => ({
          text: cleanLine(l.text, L.maxLyricChars),
          at: clamp(l.at, -1.5, Math.max(0, base.durationSec - 0.4)),
          speaker: clamp(Math.floor(l.speaker ?? 0), 0, Math.max(0, names.length - 1)),
          comment: l.comment ? cleanLine(l.comment, L.maxLineChars) : null,
          cues: (l.cues ?? []).map((c) => ({ char: clamp(Math.floor(c.char), 0, L.maxLyricChars), word: cleanLine(c.word, 24), prop: c.prop ?? null, mark: c.mark ?? null })).slice(0, 4),
          fx: l.fx ?? 'none',
          raw: l.raw ? l.raw.slice(0, 80) : null,
          hold: l.hold ?? null,
          diff: l.diff ? cleanLine(l.diff, L.maxLyricChars) : null,
          find: l.find ?? null,
          sig: l.sig ?? null,
        }))
        .filter((l) => l.text.length > 0)
        .sort((a, b) => a.at - b.at)
        .slice(0, L.maxLyricLines);
      return {
        type: 'lyricEditor',
        ...base,
        filename: cleanLine(raw.filename || 'song.js', 24) || 'song.js',
        names: names.length > 0 ? names : ['you'],
        before: (raw.before ?? []).map((l) => cleanLine(l, L.maxLyricChars)).slice(-L.maxBeforeLines),
        lines,
        prop: raw.prop ?? 'none',
        reveal: raw.reveal ?? false,
        cutIn: raw.cutIn ?? 'auto',
        split: raw.split ?? null,
        folds: raw.folds ?? null,
        twist: raw.twist ? { kind: raw.twist.kind, text: raw.twist.text.slice(0, 60), from: raw.twist.from ?? null, to: raw.twist.to ?? null, log: raw.twist.log.slice(0, 8).map((x) => x.slice(0, 40)) } : null,
        notes: (raw.notes ?? [])
          .map((n) => ({ text: cleanLine(n.text, L.maxLineChars), at: clamp(n.at, 0, Math.max(0, base.durationSec - 0.5)) }))
          .filter((n) => n.text.length > 0)
          .slice(0, 3),
      };
    }
    case 'codeEditor': {
      const code = cleanLines(raw.code, L.maxCodeLines, L.maxLineChars, lines.slice(0, 4));
      const typedText = raw.typedText ? cleanLine(raw.typedText, L.maxLineChars) : null;
      let typingLine = raw.typingLine ?? null;
      if (typedText) {
        if (typingLine === null || typingLine < 0 || typingLine >= code.length) {
          if (code.length < L.maxCodeLines) {
            code.push(typedText);
            typingLine = code.length - 1;
          } else {
            typingLine = code.length - 1;
            code[typingLine] = typedText;
          }
        } else {
          code[typingLine] = typedText;
        }
      }
      const warning = raw.warning && raw.warning.line >= 0 && raw.warning.line < code.length
        ? { line: Math.floor(raw.warning.line), text: cleanLine(raw.warning.text, 22) || 'infinite loop' }
        : null;
      const acItems = raw.autocomplete ? cleanLines(raw.autocomplete.items, 3, 16, []) : [];
      const autocomplete = raw.autocomplete && acItems.length > 0 && raw.autocomplete.line >= 0 && raw.autocomplete.line < code.length
        ? { line: Math.floor(raw.autocomplete.line), items: acItems }
        : null;
      return {
        type: 'codeEditor',
        ...base,
        filename: cleanLine(raw.filename || 'untitled.js', 24) || 'untitled.js',
        code,
        typingLine: typedText ? typingLine : null,
        typedText,
        warning,
        autocomplete,
      };
    }
    case 'macroCode':
      return {
        type: 'macroCode',
        ...base,
        token: cleanLine(raw.token, L.maxTokenChars) || 'if',
        lineNumber: clamp(Math.floor(raw.lineNumber ?? 8), 1, 999),
        context: cleanLines(raw.context, 5, L.maxLineChars, lines.slice(0, 3)),
      };
    case 'insect':
      return {
        type: 'insect',
        ...base,
        code: cleanLines(raw.code, L.maxCodeLines, L.maxLineChars, lines.slice(0, 4)),
        path: raw.path ?? 'topDown',
        stars: raw.stars ?? true,
      };
    case 'sunset': {
      let code = cleanLines(raw.code, L.maxRoadLines, L.maxLineChars, []);
      if (code.length < 10) {
        const seedLines = code.length > 0 ? code : ['drive();', '// keep going'];
        code = Array.from({ length: 18 }, (_, i) => seedLines[i % seedLines.length] as string);
      }
      return { type: 'sunset', ...base, code, sunY: clamp(raw.sunY ?? 0.12, 0, 1), haze: clamp(raw.haze ?? 0.6, 0, 1) };
    }
    case 'ambient':
      return {
        type: 'ambient',
        ...base,
        code: cleanLines(raw.code, L.maxCodeLines, L.maxLineChars, lines.slice(0, 5)),
        blurAmount: clamp(raw.blurAmount ?? 0.8, 0, 1),
      };
    case 'typography':
      return {
        type: 'typography',
        ...base,
        text: cleanLine(raw.text, L.maxTypographyChars) || (lines[0] ?? 'while (true) wait();'),
        sub: raw.sub ? cleanLine(raw.sub, L.maxLineChars) : null,
      };
  }
}

/** Break runs of more than LIMITS.maxSameTypeRun identical scene types by swapping with a later scene. */
function breakRuns(scenes: Scene[]): Scene[] {
  const out = [...scenes];
  for (let i = LIMITS.maxSameTypeRun; i < out.length; i++) {
    const t = out[i]!.type;
    if (t === 'lyricEditor') continue;
    let run = true;
    for (let k = 1; k <= LIMITS.maxSameTypeRun; k++) if (out[i - k]!.type !== t) run = false;
    if (!run) continue;
    const j = out.findIndex((s, idx) => idx > i && s.type !== t);
    if (j === -1) break;
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Scale durations so the total is exactly the target; keep every scene within bounds. */
function fitDurations(scenes: Scene[], target: number): Scene[] {
  const total = scenes.reduce((a, s) => a + s.durationSec, 0) || 1;
  const maxOf = (s: Scene) => (s.type === 'lyricEditor' ? LIMITS.maxLyricSceneSec : 8);
  const scaled = scenes.map((s) => ({ ...s, durationSec: clamp((s.durationSec / total) * target, 1.5, maxOf(s)) }));
  // Second pass to correct clamping drift.
  const total2 = scaled.reduce((a, s) => a + s.durationSec, 0);
  const diff = target - total2;
  const last = scaled[scaled.length - 1]!;
  last.durationSec = clamp(last.durationSec + diff, 1.5, maxOf(last));
  // Round to 1/30 s multiples so frame math is exact.
  const rounded = scaled.map((s) => ({ ...s, durationSec: Math.round(s.durationSec * 30) / 30 }));
  const drift = target - rounded.reduce((a, s) => a + s.durationSec, 0);
  rounded[rounded.length - 1]!.durationSec = Math.round((rounded[rounded.length - 1]!.durationSec + drift) * 30) / 30;
  return rounded;
}

export function normalize(raw: WireStoryboard, opts: NormalizeOptions = {}): Storyboard {
  const target = clamp(opts.targetDuration ?? LIMITS.defaultDuration, LIMITS.minDuration, LIMITS.maxDuration);
  const lines = cleanLines(raw.lines, LIMITS.maxLines, LIMITS.maxLineChars, ['while (true) miss(you);', '// every morning', 'later.isBetterThan(never);']);
  while (lines.length < LIMITS.minLines) lines.push(`// ${raw.topic}`.slice(0, LIMITS.maxLineChars));

  let scenes = (raw.scenes ?? []).map((s) => normScene(s, lines));
  // Song reels follow the vocals: a few long lines can mean only three or four scenes, and that is fine.
  const songReel = scenes.length > 0 && scenes.every((s) => s.type === 'lyricEditor');
  if (scenes.length < LIMITS.minScenes && !songReel) {
    const filler: SceneType[] = ['codeEditor', 'macroCode', 'ambient', 'typography', 'sunset', 'insect'];
    let i = 0;
    while (scenes.length < LIMITS.minScenes) {
      const type = filler[i++ % filler.length]!;
      scenes.push(normScene({ type, durationSec: 4, camera: null as never, effects: null as never } as unknown as WireScene, lines));
    }
  }
  const lyricReel = scenes.length > 0 && scenes.every((s) => s.type === 'lyricEditor');
  scenes = breakRuns(scenes.slice(0, lyricReel ? LIMITS.maxLyricScenes : LIMITS.maxScenes));
  scenes = fitDurations(scenes, target);

  const seed = opts.seed ?? (Number.isFinite(raw.seed) ? Math.floor(raw.seed) : hashString(raw.topic));
  const id = `${slug(raw.id || raw.topic)}-${(seed >>> 0).toString(36)}`;

  const brandFromOpts = opts.brand === undefined ? undefined : opts.brand;
  const storyboard: Storyboard = {
    id,
    topic: cleanLine(raw.topic, 80),
    seed,
    title: cleanLine(raw.title || raw.topic, 40),
    concept: raw.concept.replace(/\s+/g, ' ').trim().slice(0, 400),
    palette: { accent: hexOr(raw.palette?.accent, '#ff2a2a'), warm: hexOr(raw.palette?.warm, '#ff8a2a') },
    brand: brandFromOpts !== undefined ? (brandFromOpts ? cleanLine(brandFromOpts, 24) : null) : raw.brand ? cleanLine(raw.brand, 24) : null,
    lines,
    scenes,
    audio: {
      mood: raw.audio?.mood ?? 'warm',
      typingDensity: clamp(raw.audio?.typingDensity ?? 0.7, 0, 1),
      musicFile: raw.audio?.musicFile ? cleanLine(raw.audio.musicFile, 80) : null,
      beatSec: raw.audio?.beatSec && raw.audio.beatSec > 0.2 && raw.audio.beatSec < 2 ? raw.audio.beatSec : null,
      beatOffset: typeof raw.audio?.beatOffset === 'number' ? raw.audio.beatOffset : null,
    },
    transitions: raw.transitions ?? 'mixed',
    hero: opts.hero ?? 'none',
    song: opts.song ?? null,
    levels: opts.levels ? opts.levels.map((v) => Math.round(clamp(v, 0, 1) * 1000) / 1000) : null,
    ...(opts.extra ?? {}),
  };
  return StrictSchema.parse(storyboard);
}

/** Stable fingerprint used to keep batch outputs distinct. */
export function fingerprint(sb: Storyboard): string {
  return `${sb.scenes.map((s) => s.type[0]).join('')}|${sb.lines[0] ?? ''}`;
}
