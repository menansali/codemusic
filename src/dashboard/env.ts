import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Read and update keys in .env without touching the rest of the file. Secrets never leave this file. */
const ENV = path.join(process.cwd(), '.env');

export async function readEnv(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let src = '';
  try {
    src = await fs.readFile(ENV, 'utf8');
  } catch {
    return out;
  }
  for (const line of src.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return out;
}

export async function writeEnv(updates: Record<string, string>): Promise<void> {
  let src = '';
  try {
    src = await fs.readFile(ENV, 'utf8');
  } catch {
    src = '';
  }
  const lines = src.split(/\r?\n/);
  const seen = new Set<string>();
  const next = lines.map((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && m[1]! in updates) {
      seen.add(m[1]!);
      return `${m[1]}=${updates[m[1]!]}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(updates)) if (!seen.has(k)) next.push(`${k}=${v}`);
  await fs.writeFile(ENV, next.join('\n').replace(/\n*$/, '\n'), { mode: 0o600 });
  for (const [k, v] of Object.entries(updates)) process.env[k] = v;
}
