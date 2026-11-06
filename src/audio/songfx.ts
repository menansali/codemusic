import { promises as fs } from 'node:fs';
import type { Storyboard } from '../schema/storyboard';
import { doneFrame, twistDelayFrames, type Timeline } from '../schema/timeline';
import { TWIST_T } from '../composition/TwistOverlay';

/**
 * Edit-style processing on the trimmed song stem (music.wav), synced to the storyboard:
 *  - filter sweep: muffled for ~1.1 s before each drop, wide open on the drop
 *  - tape stop: the track winds down when the twist fires, a beat of silence, then it comes back in time
 *  - reverse swell: the first moment of each chorus, reversed, rising into it
 */
export type SongFxPlan = { drops: number[]; tapeStop: number | null; swells: number[] };

export function planSongFx(sb: Storyboard, tl: Timeline): SongFxPlan {
  const fps = tl.fps;
  const total = tl.totalFrames / fps;
  const drops: number[] = [];
  const swells: number[] = [];
  let tapeStop: number | null = null;
  let prevChorus = false;
  for (const t of tl.scenes) {
    const sc = sb.scenes[t.index]!;
    if (sc.type !== 'lyricEditor') continue;
    if (sc.cutIn === 'flash') drops.push(t.from / fps);
    if (sc.reveal && sc.twist && (sc.twist.kind === 'run' || sc.twist.kind === 'error' || sc.twist.kind === 'git')) tapeStop = (t.from + twistDelayFrames(sc, t.lyrics, fps, TWIST_T.press)) / fps + TWIST_T.press;
    t.lyrics.forEach((pl) => {
      const chorus = pl.fx === 'predict';
      if (chorus && !prevChorus) swells.push((t.from + pl.startFrame) / fps);
      prevChorus = chorus;
      void doneFrame;
    });
  }
  return {
    drops: drops.filter((d) => d > 1.4 && d < total - 0.5),
    tapeStop: tapeStop !== null && tapeStop < total - 1.5 ? tapeStop : null,
    swells: (swells.filter((c) => c > 1.2).length ? swells.filter((c) => c > 1.2) : drops.filter((d) => d > 1.4)).slice(0, 2),
  };
}

type Wav = { rate: number; ch: Float32Array[]; header: Buffer; dataOffset: number };

async function readWav(file: string): Promise<Wav> {
  const buf = await fs.readFile(file);
  let off = 12;
  let rate = 48000;
  let channels = 2;
  let bits = 16;
  let dataOffset = -1;
  let dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const len = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(off + 10);
      rate = buf.readUInt32LE(off + 12);
      bits = buf.readUInt16LE(off + 22);
    } else if (id === 'data') {
      dataOffset = off + 8;
      dataLen = Math.min(len, buf.length - dataOffset);
      break;
    }
    off += 8 + len + (len % 2);
  }
  if (dataOffset < 0 || bits !== 16) throw new Error(`unsupported wav ${file}`);
  const n = Math.floor(dataLen / (2 * channels));
  const ch = Array.from({ length: channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) ch[c]![i] = buf.readInt16LE(dataOffset + (i * channels + c) * 2) / 32768;
  return { rate, ch, header: buf.subarray(0, dataOffset), dataOffset };
}

async function writeWav(file: string, w: Wav): Promise<void> {
  const channels = w.ch.length;
  const n = w.ch[0]!.length;
  const data = Buffer.alloc(n * channels * 2);
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, w.ch[c]![i]!)) * 32767), (i * channels + c) * 2);
  const header = Buffer.from(w.header);
  header.writeUInt32LE(header.length - 8 + data.length, 4);
  header.writeUInt32LE(data.length, header.length - 4);
  await fs.writeFile(file, Buffer.concat([header, data]));
}

/** Time-varying RBJ lowpass over [a, b) seconds; cutoff(t01) in Hz. Crossfades in/out to avoid clicks. */
function sweep(w: Wav, a: number, b: number, cutoff: (k: number) => number): void {
  const sr = w.rate;
  const i0 = Math.max(0, Math.floor(a * sr));
  const i1 = Math.min(w.ch[0]!.length, Math.floor(b * sr));
  const xf = Math.floor(0.03 * sr);
  for (const x of w.ch) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    for (let i = i0; i < i1; i++) {
      if ((i - i0) % 32 === 0) {
        const f = Math.min(sr * 0.45, cutoff((i - i0) / Math.max(1, i1 - i0)));
        const w0 = (2 * Math.PI * f) / sr;
        const alpha = Math.sin(w0) / (2 * 0.9);
        const cos = Math.cos(w0);
        const a0 = 1 + alpha;
        b0 = (1 - cos) / 2 / a0;
        b1 = (1 - cos) / a0;
        b2 = b0;
        a1 = (-2 * cos) / a0;
        a2 = (1 - alpha) / a0;
      }
      const xi = x[i]!;
      const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = xi; y2 = y1; y1 = y;
      const fadeIn = Math.min(1, (i - i0) / xf);
      const fadeOut = Math.min(1, (i1 - i) / Math.max(1, Math.floor(0.004 * sr)));
      const k = Math.min(fadeIn, fadeOut);
      x[i] = xi * (1 - k) + y * k * 1.12;
    }
  }
}

/** Wind the tape down from `at` over `dur` s, hold silence, then resume in sync with a short fade. */
function tapeStop(w: Wav, at: number, dur = 0.55, gap = 0.35): void {
  const sr = w.rate;
  const s0 = Math.floor(at * sr);
  const n = Math.floor(dur * sr);
  const g = Math.floor(gap * sr);
  const fade = Math.floor(0.06 * sr);
  const len = w.ch[0]!.length;
  for (const x of w.ch) {
    const src = x.slice(s0, Math.min(len, s0 + n + g + fade + 10));
    let pos = 0;
    for (let i = 0; i < n && s0 + i < len; i++) {
      const rate = Math.pow(1 - i / n, 1.6);
      const j = Math.floor(pos);
      const fr = pos - j;
      const v = (src[j] ?? 0) * (1 - fr) + (src[j + 1] ?? 0) * fr;
      x[s0 + i] = v * Math.min(1, (n - i) / (0.08 * sr));
      pos += rate;
    }
    for (let i = n; i < n + g && s0 + i < len; i++) x[s0 + i] = 0;
    for (let i = 0; i < fade && s0 + n + g + i < len; i++) x[s0 + n + g + i]! *= i / fade;
  }
}

/** Reverse the first `dur` s of the chorus and swell it in over the `dur` s before. */
function reverseSwell(w: Wav, at: number, dur = 0.9, gain = 0.38): void {
  const sr = w.rate;
  const c = Math.floor(at * sr);
  const n = Math.floor(dur * sr);
  if (c - n < 0) return;
  for (const x of w.ch) {
    const seg = x.slice(c, Math.min(x.length, c + n));
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const env = k * k * (1 - Math.max(0, (k - 0.96) / 0.04));
      x[c - n + i]! += (seg[n - 1 - i] ?? 0) * env * gain;
    }
  }
}

export async function applySongFx(file: string, plan: SongFxPlan): Promise<void> {
  if (!plan.drops.length && plan.tapeStop === null && !plan.swells.length) return;
  const w = await readWav(file);
  for (const s of plan.swells) reverseSwell(w, s);
  for (const d of plan.drops) sweep(w, d - 1.15, d, (k) => 320 * Math.pow(9000 / 320, Math.pow(k, 2.2)));
  if (plan.tapeStop !== null) tapeStop(w, plan.tapeStop);
  await writeWav(file, w);
}
