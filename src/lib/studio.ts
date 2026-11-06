import { promises as fs } from 'node:fs';
import path from 'node:path';

/** House style for the studio. Lives in studio.json at the project root; env vars override name/tagline. */
export type StudioConfig = {
  name: string;
  tagline: string;
  palette: { accent: string; warm: string };
  cursorColors: [string, string];
  /** Props allowed in song reels, cycled per scene. */
  props: ('none' | 'stars' | 'sun' | 'beetle')[];
  transitions: 'cut' | 'whip' | 'mixed';
  filenameExt: string;
  /** Hero set piece for song reels: tape | player | horizon | none | auto (picked per song). */
  hero: string;
  /** Vibe preset: gece | arabesk | drill | ask | terminal | whatsapp | mono | auto. */
  vibe: string;
  /** End on the studio card, or loop seamlessly back into frame 0. */
  ending: 'auto' | 'card' | 'loop' | 'crt' | 'save';
  /** Show an episode tag (#012) at the start. */
  episodes: boolean;
  /** Hashtags added to every caption. */
  hashtags: string[];
  /** Opening hook: macro (smash pull-out from inside the first word), flashforward, question, none. */
  hookStyle: 'macro' | 'flashforward' | 'question' | 'none';
};

export const DEFAULT_STUDIO: StudioConfig = {
  name: '',
  tagline: 'Code-lyric reels with a plot twist. The real story behind the songs you love, typed on every beat.',
  palette: { accent: '#ff2a2a', warm: '#ff8a2a' },
  cursorColors: ['#ff2a2a', '#3d8bff'],
  props: ['none'],
  transitions: 'mixed',
  filenameExt: 'js',
  hero: 'auto',
  vibe: 'auto',
  ending: 'auto',
  episodes: true,
  hashtags: ['#keşfet', '#şarkısözleri', '#kod', '#lyrics'],
  hookStyle: 'macro',
};

export async function loadStudio(root = process.cwd()): Promise<StudioConfig> {
  let cfg: Partial<StudioConfig> = {};
  try {
    cfg = JSON.parse(await fs.readFile(path.join(root, 'studio.json'), 'utf8')) as Partial<StudioConfig>;
  } catch {
    /* no studio.json: defaults */
  }
  const merged: StudioConfig = { ...DEFAULT_STUDIO, ...cfg, palette: { ...DEFAULT_STUDIO.palette, ...(cfg.palette ?? {}) } };
  if (process.env.BRAND_NAME?.trim()) merged.name = process.env.BRAND_NAME.trim();
  if (process.env.BRAND_TAGLINE?.trim()) merged.tagline = process.env.BRAND_TAGLINE.trim();
  return merged;
}
