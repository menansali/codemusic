export type TokenKind = 'keyword' | 'call' | 'string' | 'comment' | 'number' | 'punct' | 'ident' | 'space' | 'boolean';
export type Token = { kind: TokenKind; text: string };

const KEYWORDS = new Set([
  'if', 'else', 'while', 'for', 'return', 'const', 'let', 'var', 'function', 'await', 'async', 'new', 'try', 'catch',
  'finally', 'throw', 'break', 'continue', 'import', 'export', 'from', 'default', 'class', 'this', 'in', 'of', 'do',
  'switch', 'case', 'typeof', 'void', 'delete', 'yield', 'static', 'extends',
]);
const BOOLEANS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);

/** Minimal JavaScript-flavoured tokenizer for one line. Deterministic and allocation-light. */
export function tokenize(line: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i] as string;
    if (ch === '/' && line[i + 1] === '/') {
      out.push({ kind: 'comment', text: line.slice(i) });
      break;
    }
    if (ch === ' ' || ch === '\t') {
      let j = i;
      while (j < n && (line[j] === ' ' || line[j] === '\t')) j++;
      out.push({ kind: 'space', text: line.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < n && line[j] !== ch) j++;
      out.push({ kind: 'string', text: line.slice(i, Math.min(n, j + 1)) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < n && /[0-9._]/.test(line[j] as string)) j++;
      out.push({ kind: 'number', text: line.slice(i, j) });
      i = j;
      continue;
    }
    if (/[\p{L}_$]/u.test(ch)) {
      let j = i;
      while (j < n && /[\p{L}\p{N}_$]/u.test(line[j] as string)) j++;
      const word = line.slice(i, j);
      let k = j;
      while (k < n && line[k] === ' ') k++;
      const isCall = line[k] === '(';
      const kind: TokenKind = KEYWORDS.has(word) ? 'keyword' : BOOLEANS.has(word) ? 'boolean' : isCall ? 'call' : 'ident';
      out.push({ kind, text: word });
      i = j;
      continue;
    }
    out.push({ kind: 'punct', text: ch });
    i++;
  }
  return out;
}
