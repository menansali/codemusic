import { promises as fs } from 'node:fs';

/**
 * Story file: the "real story behind the song".
 *   ? bu şarkının bir sırrı var.        -> hook question shown at 0:00
 *   @12.5 the label said no.            -> note placed at reel time 12.5 s (otherwise spread out)
 *   kayıp persona çıktı.                -> note
 *   ! albümün tek düeti bu.             -> twist: typed as a comment under the finished file
 *   !run tek düet. tek gece.            -> twist: the file is run, the console prints it
 *   !error sen is undefined             -> twist: a compile error pops up
 *   !replace seni => beni               -> twist: find & replace flips a word across the song
 *   !git son commit: gerçek hikâye.     -> twist: git log of the notes, ending on this commit
 *   !join albümün tek konuğu.           -> twist: the second artist joins the file and starts their part
 * Blank lines and lines starting with # are ignored.
 */
export type TwistKind = 'comment' | 'run' | 'error' | 'replace' | 'git' | 'join';
export type Story = {
  notes: { text: string; at: number | null }[];
  twist: { kind: TwistKind; text: string; from: string | null; to: string | null } | null;
  hook: string | null;
};

export function parseStory(src: string): Story {
  const notes: Story['notes'] = [];
  let twist: Story['twist'] = null;
  let hook: string | null = null;
  for (const raw of src.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('?')) {
      hook = line.slice(1).trim() || null;
      continue;
    }
    const tw = line.match(/^!(run|error|replace|git|join)?\s*(.*)$/);
    if (tw) {
      const kind = (tw[1] ?? 'comment') as TwistKind;
      const text = (tw[2] ?? '').trim();
      if (kind === 'replace') {
        const m = text.match(/^(.+?)\s*(?:=>|->|→)\s*(.+)$/);
        if (m) twist = { kind, text, from: m[1]!.trim(), to: m[2]!.trim() };
      } else if (text || kind === 'git' || kind === 'join') {
        twist = { kind, text, from: null, to: null };
      }
      continue;
    }
    let at: number | null = null;
    const m = line.match(/^@(\d+(?:\.\d+)?)\s+(.*)$/);
    if (m) {
      at = Number(m[1]);
      line = (m[2] ?? '').trim();
    }
    line = line.replace(/^(\/\/|●|-)\s*/, '');
    if (line) notes.push({ text: line, at });
  }
  return { notes, twist, hook };
}

export async function loadStory(file: string): Promise<Story> {
  return parseStory(await fs.readFile(file, 'utf8'));
}
