import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Storyboard } from '../schema/storyboard';
import type { ProbeResult } from './validate';

export type Manifest = {
  id: string;
  topic: string;
  title: string;
  concept: string;
  seed: number;
  generator: 'claude' | 'fallback';
  model: string | null;
  createdAt: string;
  durationSec: number;
  frames: number;
  fps: number;
  width: number;
  height: number;
  files: { video: string; storyboard: string; bed: string; sfx: string; music: string | null };
  scenes: { index: number; type: string; durationSec: number; from: number; durationInFrames: number }[];
  render: { quality: string; ms: number; crf: number; preset: string; concurrency: number };
  probe: ProbeResult;
  validation: { ok: boolean; errors: string[] };
  notes: string[];
  song?: { file: string; startSec: number; bpm: number; lyrics: string | null; names: string[] };
};

export async function writeManifest(dir: string, manifest: Manifest): Promise<string> {
  const file = path.join(dir, 'manifest.json');
  await fs.writeFile(file, JSON.stringify(manifest, null, 2));
  return file;
}

export async function readManifests(outputRoot: string): Promise<Manifest[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(outputRoot);
  } catch {
    return [];
  }
  const out: Manifest[] = [];
  for (const e of entries) {
    try {
      const raw = await fs.readFile(path.join(outputRoot, e, 'manifest.json'), 'utf8');
      out.push(JSON.parse(raw) as Manifest);
    } catch {
      /* not a render dir */
    }
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function storyboardSummary(sb: Storyboard): string {
  return sb.scenes.map((s, i) => `${i + 1}. ${s.type.padEnd(10)} ${s.durationSec.toFixed(2)}s`).join('\n');
}
