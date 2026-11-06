/**
 * Turns a lyric line into one or two "code" lines in the house style:
 *   "what is love"            -> what.is(love);
 *   "baby don't hurt me"      -> baby.dont(hurt(me));
 *   "inandım, inandım, inandım" -> inandim(); inandim(); inandim();
 * Deterministic, language-agnostic, keeps Latin diacritics (the vendored font covers them).
 */

const MAX = 34;
/** Target width per code line: short lines keep the type large on a 1080 px frame. */
const TARGET = 22;

function words(clause: string): string[] {
  return clause
    .toLocaleLowerCase('tr')
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function shape(ws: string[], question: boolean): string {
  let s: string;
  switch (ws.length) {
    case 0:
      return '';
    case 1:
      s = `${ws[0]}();`;
      break;
    case 2:
      s = `${ws[0]}(${ws[1]});`;
      break;
    case 3:
      s = `${ws[0]}.${ws[1]}(${ws[2]});`;
      break;
    case 4:
      s = `${ws[0]}.${ws[1]}(${ws[2]}.${ws[3]});`;
      break;
    default:
      s = `${ws[0]}.${ws[1]}(${ws[2]}, ${ws.slice(3).join('.')});`;
  }
  if (question) s = `if (${s.slice(0, -1)})`;
  return s;
}

/** Split a long word list into chunks of at most 4 words, balancing sizes. */
function chunk(ws: string[]): string[][] {
  if (ws.length <= 4) return [ws];
  const parts = Math.ceil(ws.length / 4);
  const size = Math.ceil(ws.length / parts);
  const out: string[][] = [];
  for (let i = 0; i < ws.length; i += size) out.push(ws.slice(i, i + size));
  return out;
}

export function codifyLine(lyric: string): string[] {
  const out: string[] = [];
  // clauses by comma / semicolon / dash; question mark marks the clause
  const clauses = lyric.split(/[,;]|\s[-–—]\s|\s-$/).map((c) => c.trim()).filter(Boolean);
  for (const clause of clauses) {
    const question = /\?/.test(clause);
    const ws = words(clause);
    if (ws.length === 0) continue;
    // repeated single word run -> w(); w(); w();
    if (ws.length >= 2 && ws.every((w) => w === ws[0])) {
      out.push(ws.map((w) => `${w}();`).join(' ').slice(0, MAX));
      continue;
    }
    const emit = (part: string[]): void => {
      const line = shape(part, question);
      if (line.length <= (question ? TARGET + 6 : TARGET) || part.length === 1) {
        out.push(line.length > MAX ? line.slice(0, MAX - 1) + ';' : line);
        return;
      }
      const mid = Math.ceil(part.length / 2);
      emit(part.slice(0, mid));
      emit(part.slice(mid));
    };
    for (const part of chunk(ws)) emit(part);
  }
  // merge very short consecutive fragments onto one line when they fit
  const merged: string[] = [];
  for (const l of out) {
    const last = merged[merged.length - 1];
    if (last && last.length + 1 + l.length <= TARGET && last.length < 12) merged[merged.length - 1] = `${last} ${l}`;
    else merged.push(l);
  }
  return merged.length > 0 ? merged : [`// ${lyric.slice(0, MAX - 3)}`];
}
