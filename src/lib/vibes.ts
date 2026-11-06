import { COLORS, type EditorColors } from '../editor/theme';

/**
 * A vibe is a complete look for one song: editor theme, palette, hero piece, overlay, cut style,
 * how hard the camera hits, and which surface the lyrics appear on.
 */
/** [saturate, brightness, contrast, hue-rotate deg, sepia] */
export type Grade = [number, number, number, number, number];

export type Vibe = {
  id: VibeId;
  label: string;
  colors: EditorColors;
  palette: { accent: string; warm: string };
  cursorColors: [string, string];
  hero: 'none' | 'neon' | 'tape' | 'player' | 'horizon';
  /** Screen-space look laid over everything. */
  overlay: 'none' | 'vhs' | 'crt';
  transitions: 'cut' | 'whip' | 'mixed';
  /** Multiplier for the kick-drum camera punch (0 disables). */
  punch: number;
  /** RGB glitch on drops and breaks (0..1). */
  glitch: number;
  grain: number;
  /** Scales the Dutch tilt of macro shots. */
  tilt: number;
  /** 'editor' = code editor, 'chat' = lyrics as messages in a chat thread. */
  surface: 'editor' | 'chat';
  props: ('none' | 'stars' | 'sun')[];
  hashtags: string[];
  /** Scene cuts this vibe uses when the storyboard says auto. */
  cuts: ('whipUp' | 'whipDown' | 'focusPull' | 'flash' | 'smear' | 'burn' | 'bokeh' | 'none')[];
  /** Picture stutter on chorus landings. */
  stutter: boolean;
  /** Colour grade: verse, chorus, twist as CSS filter strings. */
  grade: { verse: Grade; chorus: Grade; twist: Grade };
  /** Default ending when studio.json says auto. */
  ending: 'card' | 'loop' | 'crt' | 'save';
};

export const VIBE_IDS = ['gece', 'arabesk', 'drill', 'ask', 'terminal', 'whatsapp', 'mono'] as const;
export type VibeId = (typeof VIBE_IDS)[number];

const dark = COLORS;

export const VIBES: Record<VibeId, Vibe> = {
  gece: {
    id: 'gece', label: 'Gece / hüzün', colors: dark,
    palette: { accent: '#ff2a2a', warm: '#ff8a2a' }, cursorColors: ['#ff2a2a', '#3d8bff'],
    hero: 'none', overlay: 'none', transitions: 'mixed', punch: 0.5, glitch: 0, grain: 1, tilt: 1,
    surface: 'editor', props: ['none'], hashtags: ['#türkçerap', '#gece'],
    cuts: ['whipUp', 'whipDown', 'none', 'whipUp', 'flash'], stutter: true, grade: { verse: [0.78, 0.94, 1, -8, 0], chorus: [1.22, 1.04, 1.06, 0, 0], twist: [0.55, 1, 1.12, -18, 0] }, ending: 'save',
  },
  arabesk: {
    id: 'arabesk', label: 'Arabesk VHS',
    colors: { ...dark, bg: '#0d0a08', text: '#f3e6cf', textDim: '#b5a48a', call: '#e8b65a', string: '#ff9e5e', comment: '#7d6b58', gutter: '#6a5a48' },
    palette: { accent: '#e8432f', warm: '#f2a23a' }, cursorColors: ['#e8432f', '#6fa8dc'],
    hero: 'tape', overlay: 'vhs', transitions: 'cut', punch: 0.25, glitch: 0.35, grain: 1.3, tilt: 0.6,
    surface: 'editor', props: ['none'], hashtags: ['#arabesk', '#eskişarkılar', '#nostalji'],
    cuts: ['none', 'focusPull', 'none'], stutter: false, grade: { verse: [0.85, 0.95, 1, 0, 0.25], chorus: [1.25, 1, 1.05, 0, 0.1], twist: [0.7, 1, 1.15, 0, 0.5] }, ending: 'crt',
  },
  drill: {
    id: 'drill', label: 'Drill / club',
    colors: { ...dark, bg: '#07060a', text: '#f2f0ff', textDim: '#9b97b5', call: '#3ff0ff', string: '#ff4fd8', comment: '#5d5a78', number: '#3ff0ff', punct: '#c7c3e6', gutter: '#4a4766' },
    palette: { accent: '#ff2bd6', warm: '#3ff0ff' }, cursorColors: ['#ff2bd6', '#3ff0ff'],
    hero: 'none', overlay: 'none', transitions: 'whip', punch: 1.4, glitch: 1, grain: 0.8, tilt: 1.4,
    surface: 'editor', props: ['none'], hashtags: ['#drill', '#türkçerap', '#trap'],
    cuts: ['smear', 'whipUp', 'smear', 'whipDown', 'flash'], stutter: true, grade: { verse: [0.85, 1, 1.08, 8, 0], chorus: [1.4, 1.05, 1.14, 0, 0], twist: [0.3, 1, 1.25, 0, 0] }, ending: 'card',
  },
  ask: {
    id: 'ask', label: 'Aşk / pop',
    colors: { ...dark, bg: '#f6ece6', bgPanel: '#efe1d8', text: '#3a2630', textDim: '#8a6f78', call: '#c2477a', string: '#d9733f', comment: '#b49aa3', number: '#d9733f', punct: '#6e5560', gutter: '#c9b2ba', popupBg: '#fff6f1', popupBorder: '#e5cfd6', warningBg: '#fff0e0', warningText: '#a8621c', warningBorder: '#e0a05a' },
    palette: { accent: '#e2386f', warm: '#ff9a7a' }, cursorColors: ['#e2386f', '#6c7bff'],
    hero: 'player', overlay: 'none', transitions: 'mixed', punch: 0.4, glitch: 0, grain: 0.6, tilt: 0.7,
    surface: 'editor', props: ['none'], hashtags: ['#aşkşarkıları', '#pop'],
    cuts: ['focusPull', 'none'], stutter: false, grade: { verse: [0.85, 1.02, 1, 0, 0], chorus: [1.18, 1.04, 1, -6, 0], twist: [0.6, 1, 1.08, 10, 0] }, ending: 'save',
  },
  terminal: {
    id: 'terminal', label: 'Terminal',
    colors: { ...dark, bg: '#020702', bgPanel: '#041004', text: '#7dff9a', textDim: '#3fae5a', call: '#c8ffd2', string: '#b6ff6a', comment: '#2f7a40', number: '#b6ff6a', punct: '#5fd47a', gutter: '#1f5a2c', popupBg: '#041004', popupBorder: '#1f5a2c' },
    palette: { accent: '#3dff6e', warm: '#9dff3d' }, cursorColors: ['#3dff6e', '#ffd23d'],
    hero: 'none', overlay: 'crt', transitions: 'cut', punch: 0.5, glitch: 0.5, grain: 0.9, tilt: 0.3,
    surface: 'editor', props: ['none'], hashtags: ['#alternatif', '#rock'],
    cuts: ['none', 'flash', 'none'], stutter: true, grade: { verse: [1, 0.92, 1, 0, 0], chorus: [1, 1.08, 1.08, 0, 0], twist: [1.4, 1, 1, -100, 0] }, ending: 'crt',
  },
  whatsapp: {
    id: 'whatsapp', label: 'WhatsApp',
    colors: { ...dark, bg: '#0b141a', text: '#e9edef', textDim: '#8696a0', comment: '#8696a0' },
    palette: { accent: '#25d366', warm: '#ffb15c' }, cursorColors: ['#25d366', '#53bdeb'],
    hero: 'none', overlay: 'none', transitions: 'cut', punch: 0.3, glitch: 0, grain: 0.5, tilt: 0,
    surface: 'chat', props: ['none'], hashtags: ['#ayrılık', '#mesaj'],
    cuts: ['none'], stutter: false, grade: { verse: [0.9, 1, 1, 0, 0], chorus: [1.1, 1, 1, 0, 0], twist: [0.6, 1, 1, 0, 0] }, ending: 'card',
  },
  mono: {
    id: 'mono', label: 'Mono / siyah-beyaz',
    colors: { ...dark, bg: '#0b0b0b', bgPanel: '#121212', text: '#f2f2f0', textDim: '#9a9a96', call: '#ffffff', string: '#cfcfcb', comment: '#5e5e5b', number: '#e4e4e0', punct: '#8c8c88', gutter: '#4a4a47', popupBg: '#151515', popupBorder: '#2e2e2c', warningBg: '#1c1c1b', warningText: '#e8e8e4', warningBorder: '#8c8c88' },
    palette: { accent: '#f2f2f0', warm: '#9a9a96' }, cursorColors: ['#f2f2f0', '#7a7a76'],
    hero: 'none', overlay: 'none', transitions: 'cut', punch: 0.35, glitch: 0, grain: 1.1, tilt: 0.5,
    surface: 'editor', props: ['none'], hashtags: ['#türkçerap', '#motive'],
    cuts: ['none', 'focusPull', 'none', 'flash'], stutter: false, grade: { verse: [0.9, 0.97, 1.04, 0, 0], chorus: [1, 1.02, 1.08, 0, 0], twist: [1, 1, 1.1, 0, 0] }, ending: 'card',
  },
};

const ARABESK = /^(kader|gurbet|dert|felek|yar$|yari|gonul|sevdalim|elveda|hasret|garip|agla|zalim)/;
const LOVE = /^(ask|sev|kalp|optum|sarıl|saril|guzel|gul)/;
const BREAKUP = /^(mesaj|yaz|sil|engel|cevap|telefon|ara|son$|gorul|cevrimici|bitti|ayrildik|gitti)/;

/** Heuristic pick from tempo, energy and lyric vocabulary. --vibe overrides. */
export function pickVibe(input: { bpm: number; meanLevel: number; words: string[] }): VibeId {
  const w = input.words;
  const count = (re: RegExp) => w.filter((x) => re.test(x)).length;
  if (count(ARABESK) >= 2) return 'arabesk';
  if (count(BREAKUP) >= 3) return 'whatsapp';
  if (input.bpm >= 138 || (input.meanLevel > 0.62 && input.bpm >= 125)) return 'drill';
  if (count(LOVE) >= 4 && input.meanLevel < 0.55) return 'ask';
  return 'gece';
}

export const gradeFilter = (g: Grade): string => `saturate(${g[0].toFixed(3)}) brightness(${g[1].toFixed(3)}) contrast(${g[2].toFixed(3)}) hue-rotate(${g[3].toFixed(1)}deg) sepia(${g[4].toFixed(3)})`;
export const mixGrade = (a: Grade, b: Grade, k: number): Grade => a.map((v, i) => v + (b[i]! - v) * k) as Grade;
