import { promises as fs } from 'node:fs';

/** `singer` comes from section headers such as `[Nakarat: Poizi]` or `[Bölüm 1: BLOK3]`. */
export type LyricLine = { t: number; text: string; singer?: string | null };

/** Standard LRC metadata tags, which look like headers but are not sections. */
const META = /^(ar|ti|al|au|by|re|ve|offset|length|la|id|#)$/i;

/** Parse LRC ("[mm:ss.xx] text") into sorted lines. Empty lines are kept as instrumental markers. */
export function parseLrc(src: string): LyricLine[] {
  const out: LyricLine[] = [];
  let singer: string | null = null;
  for (const raw of src.split(/\r?\n/)) {
    const m = raw.match(/^\s*\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    const body = m ? (m[3] ?? '').trim() : raw.trim();
    // Section header, timed or not: "[Nakarat: Poizi]" sets the singer, "[Bölüm 2]" clears it.
    const h = body.match(/^\[([^\]:]+)(?::\s*([^\]]*))?\]$/);
    if (h && !META.test(h[1]!.trim()) && !/^\d/.test(h[1]!.trim())) {
      singer = h[2]?.trim() || null;
      continue;
    }
    if (!m) continue;
    out.push({ t: Number(m[1]) * 60 + Number(m[2]), text: body, singer });
  }
  return out.sort((a, b) => a.t - b.t);
}

export async function loadLrc(file: string): Promise<LyricLine[]> {
  return parseLrc(await fs.readFile(file, 'utf8'));
}

const fold = (s: string) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** First line containing the hook phrase (diacritics-insensitive), or null. */
export function findHook(lines: LyricLine[], hook: string): LyricLine | null {
  const h = fold(hook);
  return lines.find((l) => fold(l.text).includes(h)) ?? null;
}

/** Lines whose start falls inside [start, start + seconds). */
export function windowLines(lines: LyricLine[], start: number, seconds: number): LyricLine[] {
  return lines.filter((l) => l.t >= start && l.t < start + seconds && l.text.length > 0);
}
