import type { SignatureKind } from '../schema/storyboard';
import { fold } from './lexicon';

/**
 * One signature effect per song, the way Yin Yang got its split: the effect comes from what the song is
 * about. The title decides first; otherwise a word that recurs in the reel's lyrics (twice or more).
 * Each kind fires once, on the first time its word is typed.
 */
const RULES: { kind: Exclude<SignatureKind, 'yinyang'>; re: RegExp }[] = [
  // mirror: the editor turns around and the text reads backwards for a moment
  { kind: 'mirror', re: /^(ayna|aynada|aynaya|aynadaki|yansima|yansiman|tersine|mirror|reflection)$/ },
  // loop: the line duplicates itself down the file, like a stuck loop
  { kind: 'loop', re: /^(dongu|donguye|dongude|tekrar|tekrardan|yeniden|loop|again|repeat|sonsuz|sonsuza|forever)$/ },
  // retro: the editor becomes an old green-on-black screen for the rest of the shot
  { kind: 'retro', re: /^(eski|eskiden|eskisi|gecmis|gecmise|gecmiste|nostalji|hatira|hatiralar|anilar|cocukken|cocukluk|cocuklugum|retro|memories|past)$/ },
  // light: the editor switches to light mode
  { kind: 'light', re: /^(isik|isiklar|isigi|isigim|aydinlik|aydinlat|light|lights)$/ },
];

const words = (s: string): string[] => Array.from(fold(s).match(/[a-z0-9]+/g) ?? []);

export function signatureRegex(kind: SignatureKind): RegExp {
  if (kind === 'yinyang') return /^yang$/;
  return RULES.find((r) => r.kind === kind)!.re;
}

/** Pick the signature for a song. `override` is the user's choice ('auto' picks, 'none' turns it off). */
export function pickSignature(title: string, lyrics: string[], override: string | undefined): SignatureKind | 'none' {
  if (override && override !== 'auto') return (override as SignatureKind | 'none');
  const t = words(title);
  const lw = lyrics.flatMap(words);
  if ((t.includes('yin') && t.includes('yang')) || (lw.includes('yin') && lw.includes('yang'))) return 'yinyang';
  for (const r of RULES) if (t.some((w) => r.re.test(w))) return r.kind;
  let best: { kind: SignatureKind; n: number } | null = null;
  for (const r of RULES) {
    const n = lw.filter((w) => r.re.test(w)).length;
    if (n >= 2 && (!best || n > best.n)) best = { kind: r.kind, n };
  }
  return best?.kind ?? 'none';
}

/** Index just after the first word in `code` that names the signature, or -1. */
export function signatureChar(kind: SignatureKind, code: string): number {
  const f = fold(code);
  if (kind === 'yinyang') {
    if (!f.includes('yin')) return -1;
    const k = f.indexOf('yang');
    return k < 0 ? -1 : k + 4;
  }
  const re = signatureRegex(kind);
  for (const m of f.matchAll(/[a-z0-9]+/g)) if (re.test(m[0])) return m.index! + m[0].length;
  return -1;
}
