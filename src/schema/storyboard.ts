import { z } from 'zod';

/**
 * Two schema flavours built from one definition:
 *  - wire   : sent to the Claude API via zodOutputFormat. No numeric/length bounds, no defaults,
 *             nullable instead of optional. Limits are described in text and enforced later.
 *  - strict : applied after normalize(). Carries real bounds and refinements.
 */

export const SCENE_TYPES = ['codeEditor', 'macroCode', 'insect', 'sunset', 'ambient', 'typography', 'lyricEditor'] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

export const LIMITS = {
  maxCodeLines: 7,
  maxLineChars: 30,
  maxRoadLines: 24,
  maxTokenChars: 12,
  maxTypographyChars: 26,
  minScenes: 5,
  maxScenes: 8,
  minLines: 3,
  maxLines: 8,
  minDuration: 25,
  maxDuration: 35,
  defaultDuration: 30,
  maxSameTypeRun: 2,
  maxLyricChars: 34,
  maxLyricLines: 10,
  maxBeforeLines: 24,
  maxLyricSceneSec: 14,
  maxLyricScenes: 16,
} as const;

export const HERO_KINDS = ['none', 'neon', 'tape', 'player', 'horizon'] as const;
export const CUT_KINDS = ['auto', 'none', 'whipUp', 'whipDown', 'focusPull', 'flash', 'smear', 'burn', 'bokeh'] as const;
export const LINE_FX = ['none', 'slow', 'backspace', 'predict'] as const;
export const TWIST_KINDS = ['comment', 'run', 'error', 'replace', 'git', 'join'] as const;
/** Inline word behaviours: the letters act out what the word means. */
export const MARK_KINDS = ['strike', 'underline', 'shatter', 'burn', 'frost', 'fall', 'float', 'dissolve', 'shout', 'whisper', 'pulse', 'bounce', 'shine'] as const;
export const ENDINGS = ['card', 'loop', 'crt', 'save'] as const;
/** One effect per song, picked from its title or lyrics, fired once on the word that names it. */
export const SIGNATURES = ['yinyang', 'mirror', 'loop', 'retro', 'light'] as const;
export type SignatureKind = (typeof SIGNATURES)[number];

function build(strict: boolean) {
  const num = (min: number, max: number, desc: string) => {
    const base = z.number().describe(`${desc} (${min} to ${max})`);
    return strict ? base.min(min).max(max) : base;
  };
  const int = (desc: string) => (strict ? z.number().int().describe(desc) : z.number().describe(desc));
  const str = (max: number, desc: string) => {
    const base = z.string().describe(`${desc} (max ${max} characters)`);
    return strict ? base.max(max) : base;
  };
  const strArr = (maxItems: number, maxChars: number, desc: string) => {
    const base = z.array(str(maxChars, 'line')).describe(`${desc} (max ${maxItems} items)`);
    return strict ? base.min(1).max(maxItems) : base;
  };
  // Wire schema uses nullable (JSON-schema friendly); strict allows optional too.
  const opt = <T extends z.ZodTypeAny>(s: T) => (strict ? s.nullable().optional() : s.nullable());

  const Camera = z
    .object({
      zoomFrom: num(1, 4.5, 'Camera zoom at scene start. 1 = whole editor, 4.5 = extreme macro'),
      zoomTo: num(1, 4.5, 'Camera zoom at scene end'),
      panFrom: z.object({
        x: num(-1, 1, 'Horizontal focus point at start, -1 left edge, 1 right edge'),
        y: num(-1, 1, 'Vertical focus point at start, -1 top, 1 bottom'),
      }),
      panTo: z.object({ x: num(-1, 1, 'Horizontal focus point at end'), y: num(-1, 1, 'Vertical focus point at end') }),
      tiltDeg: num(-25, 25, 'Dutch tilt in degrees; the reference uses 6 to 18'),
      focusFrom: num(0, 1, 'Focus sharpness at start, 0 fully defocused, 1 sharp'),
      focusTo: num(0, 1, 'Focus sharpness at end'),
    })
    .describe('Camera move for this scene. The camera moves independently of the code layer.');

  const Effects = z
    .object({
      grain: num(0, 1, 'Film grain intensity'),
      lightLeak: num(0, 1, 'Warm amber light leak intensity'),
      dust: num(0, 1, 'Floating dust density'),
      stars: num(0, 1, 'Sparkle star density'),
      aberration: num(0, 1, 'Chromatic aberration strength'),
      vignette: num(0, 1, 'Vignette strength'),
    })
    .describe('Effect intensities for this scene');

  const common = {
    durationSec: num(1.5, 8, 'Scene duration in seconds. All scenes together must total about 30 seconds'),
    camera: Camera,
    effects: Effects,
  };

  const CodeEditorScene = z.object({
    type: z.literal('codeEditor'),
    ...common,
    filename: str(24, 'Editor tab filename, e.g. summertime.js'),
    code: strArr(LIMITS.maxCodeLines, LIMITS.maxLineChars, 'Visible code lines, JavaScript-flavoured poetry'),
    typingLine: opt(int('Zero-based index of the line being typed live, or null')),
    typedText: opt(str(LIMITS.maxLineChars, 'Text typed live on typingLine with the red block cursor, or null')),
    warning: opt(
      z.object({
        line: int('Zero-based line index that gets a red squiggle'),
        text: str(22, 'Short amber tooltip text, e.g. "infinite loop"'),
      }),
    ),
    autocomplete: opt(
      z.object({
        line: int('Zero-based line index the popup attaches to'),
        items: strArr(3, 16, 'Up to 3 autocomplete suggestions'),
      }),
    ),
  });

  const MacroCodeScene = z.object({
    type: z.literal('macroCode'),
    ...common,
    token: str(LIMITS.maxTokenChars, 'Single token shown huge in focus with cursor, e.g. "if" or "never"'),
    lineNumber: int('Gutter line number shown beside the token'),
    context: strArr(5, LIMITS.maxLineChars, 'Out-of-focus surrounding code lines'),
  });

  const InsectScene = z.object({
    type: z.literal('insect'),
    ...common,
    code: strArr(LIMITS.maxCodeLines, LIMITS.maxLineChars, 'Code lines the insect crawls across'),
    path: z.enum(['leftToRight', 'topDown', 'diagonal']).describe('Insect crawl direction'),
    stars: z.boolean().describe('Whether sparkle stars accompany the insect'),
  });

  const SunsetScene = z.object({
    type: z.literal('sunset'),
    ...common,
    code: strArr(LIMITS.maxRoadLines, LIMITS.maxLineChars, 'Repeating road lines receding toward the sun'),
    sunY: num(0, 1, 'Vertical sun position, 0 top of frame'),
    haze: num(0, 1, 'Orange atmospheric haze amount'),
  });

  const AmbientScene = z.object({
    type: z.literal('ambient'),
    ...common,
    code: strArr(LIMITS.maxCodeLines, LIMITS.maxLineChars, 'Code lines seen fully out of focus as bokeh'),
    blurAmount: num(0, 1, 'How defocused the scene is'),
  });

  const TypographyScene = z.object({
    type: z.literal('typography'),
    ...common,
    text: str(LIMITS.maxTypographyChars, 'One large typed line, e.g. me.mood = "sadness";'),
    sub: opt(str(LIMITS.maxLineChars, 'Optional smaller comment line below, or null')),
  });

  const LyricLine = z.object({
    text: str(LIMITS.maxLyricChars, 'Lyric line rendered as code, e.g. what.is(love);'),
    at: z.number().describe('Seconds after scene start when typing of this line begins'),
    speaker: int('Cursor index typing this line: 0 or 1'),
    comment: opt(str(LIMITS.maxLineChars, 'Optional // comment shown under the line, or null')),
    cues: z
      .array(
        z.object({
          char: int('Character index in text after which the cue fires'),
          word: str(24, 'The word that triggered the cue'),
          prop: z.enum(['rain', 'sun', 'moon', 'stars', 'heart', 'fire', 'photo', 'clock', 'smile', 'wave', 'smoke', 'loop', 'glass']).nullable().describe('Visual prop, or null'),
          mark: z.enum(MARK_KINDS).nullable().describe('Letter behaviour of the word (burn, frost, fall, float, dissolve, shout, whisper, pulse, bounce, shine, shatter, strike, underline), or null'),
        }),
      )
      .describe('Visual cues fired while the line is typed'),
    fx: z.enum(LINE_FX).describe('Typing style: slow (speed ramp), backspace (hesitate and retype), predict (ghost text ahead of the cursor)'),
    raw: opt(z.string().describe('Original lyric text on the first fragment of each sung line, or null')),
    // Song-reel extras, filled by the songboard (never requested from the model).
    /** A held note: the vowel at `char` keeps typing from `s` to `e` (seconds after scene start). */
    hold: z.object({ char: z.number(), s: z.number(), e: z.number() }).nullable().optional(),
    /** This line rewrites an earlier one: the old version shows above it as a removed diff line. */
    diff: z.string().nullable().optional(),
    /** Search the file for `word` once the line has typed up to `char` (the chorus word). */
    find: z.object({ word: z.string(), char: z.number() }).nullable().optional(),
    /** The song's signature effect fires once the line has typed up to `char`. */
    sig: z.object({ kind: z.enum(SIGNATURES), char: z.number() }).nullable().optional(),
  });

  const LyricEditorScene = z.object({
    type: z.literal('lyricEditor'),
    ...common,
    durationSec: num(1.5, LIMITS.maxLyricSceneSec, 'Scene duration in seconds (lyric scenes follow the vocal timing)'),
    filename: str(24, 'Editor tab filename'),
    names: z.array(str(14, 'Cursor label')).describe('Cursor names shown as tags, 1 or 2'),
    before: z.array(str(LIMITS.maxLyricChars, 'line')).describe(`Lines already typed in earlier scenes, shown static above (0 to ${LIMITS.maxBeforeLines})`),
    lines: z.array(LyricLine).describe(`Lines typed live in this scene (0 to ${LIMITS.maxLyricLines})`),
    prop: z.enum(['none', 'beetle', 'sun', 'stars']).describe('Surreal prop layered over the scene'),
    reveal: z.boolean().describe('Wide reveal of the whole file instead of a macro shot'),
    cutIn: z.enum(CUT_KINDS).describe('Transition into this scene; auto lets the studio pick'),
    twist: opt(
      z.object({
        kind: z.enum(TWIST_KINDS),
        text: z.string(),
        from: opt(z.string()),
        to: opt(z.string()),
        log: z.array(z.string()),
      }),
    ),
    /** Duet scene: two editor panes, one per singer. */
    split: z.boolean().nullable().optional(),
    /** Reveal only: runs of `before` lines (verses) that fold into one line, [from, to). */
    folds: z.array(z.object({ from: z.number(), to: z.number(), label: z.string() })).nullable().optional(),
    notes: z.array(
      z.object({
        text: str(LIMITS.maxLineChars, 'Story note shown as a small tag, e.g. "2013. first demo"'),
        at: z.number().describe('Seconds after scene start when the note appears'),
      }),
    ).describe('Narration tags that tell the real story behind the song (0 to 3)'),
  });

  const Scene = z.discriminatedUnion('type', [
    LyricEditorScene,
    CodeEditorScene,
    MacroCodeScene,
    InsectScene,
    SunsetScene,
    AmbientScene,
    TypographyScene,
  ]);

  const scenesBase = z.array(Scene).describe(`Storyboard scenes in order (${LIMITS.minScenes} to ${LIMITS.maxScenes})`);
  const linesBase = strArr(LIMITS.maxLines, LIMITS.maxLineChars, 'Poetic programming lines that define the piece');

  const Storyboard = z.object({
    id: str(48, 'Short kebab-case id derived from the topic'),
    topic: str(80, 'The input topic'),
    seed: int('Integer random seed for reproducible renders'),
    title: str(40, 'Short evocative title'),
    concept: str(400, 'Two or three sentences describing the creative concept and emotional arc'),
    palette: z.object({
      accent: str(9, 'Hex colour for keywords and cursor, usually a red like #ff2a2a'),
      warm: str(9, 'Hex colour for light leaks and sun, usually an amber like #ff8a2a'),
    }),
    brand: opt(str(24, 'Optional brand mark text, or null')),
    lines: strict ? linesBase.min(LIMITS.minLines) : linesBase,
    // Topic reels pad to minScenes in normalize(); song reels can be shorter.
    scenes: strict ? scenesBase.min(2).max(LIMITS.maxLyricScenes) : scenesBase,
    audio: z.object({
      mood: z.enum(['warm', 'cold', 'dusty']).describe('Ambience mood'),
      typingDensity: num(0, 1, 'How much typing sound is present'),
      musicFile: opt(str(80, 'Optional music filename from assets/music, or null')),
      beatSec: opt(z.number().describe('Seconds per beat when the reel is cut to music, or null')),
      beatOffset: opt(z.number().describe('Reel time of the first beat, or null')),
    }),
    transitions: z.enum(['cut', 'whip', 'mixed']).describe('Cut style between scenes'),
  });

  return { Storyboard, Scene, Camera, Effects };
}

export const WireSchema = build(false).Storyboard;
const strictBuilt = build(true);
/** Song-reel extras live only on the strict schema: they are never requested from the model. */
export const StrictSchema = strictBuilt.Storyboard.extend({
  hero: z.enum(HERO_KINDS).optional(),
  song: z.object({ title: z.string(), artist: z.string(), startSec: z.number(), durationSec: z.number() }).nullable().optional(),
  levels: z.array(z.number()).nullable().optional(),
  vibe: z.enum(['gece', 'arabesk', 'drill', 'ask', 'terminal', 'whatsapp', 'mono']).optional(),
  /** Reel frames of kick drums (camera punch). */
  kicks: z.array(z.number()).nullable().optional(),
  /** Reel frames of snare hits (camera nudge, line numbers flicker). */
  snares: z.array(z.number()).nullable().optional(),
  /** The song's signature effect ('none' when nothing in the title or lyrics names one). */
  signature: z.enum(['yinyang', 'mirror', 'loop', 'retro', 'light', 'none']).nullable().optional(),
  /** Reel seconds of forced pattern breaks (snap zoom + glitch). */
  breaks: z.array(z.number()).nullable().optional(),
  hook: z.object({ style: z.enum(['macro', 'question', 'flashforward', 'none']), text: z.string().nullable() }).nullable().optional(),
  ending: z.enum(ENDINGS).optional(),
  /** Reel frames of stutter edits (picture repeats a few frames). */
  stutters: z.array(z.number()).nullable().optional(),
  episode: z.number().nullable().optional(),
});
export const CameraSchema = strictBuilt.Camera;
export const EffectsSchema = strictBuilt.Effects;

export type Storyboard = z.infer<typeof StrictSchema>;
export type WireStoryboard = z.infer<typeof WireSchema>;
export type Scene = Storyboard['scenes'][number];
export type SceneOf<T extends SceneType> = Extract<Scene, { type: T }>;
export type Camera = z.infer<typeof CameraSchema>;
export type Effects = z.infer<typeof EffectsSchema>;
