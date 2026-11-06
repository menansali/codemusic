import { spawn } from 'node:child_process';
import { ffmpegBin } from './post';

const SR = 22050;

export type BeatInfo = { bpm: number; beatSec: number; firstBeat: number; loudestStart: number; durationSec: number };

async function decodeMono(file: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBin(), ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-']);
    const chunks: Buffer[] = [];
    child.stdout.on('data', (d: Buffer) => chunks.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg decode failed (${code})`));
      const buf = Buffer.concat(chunks);
      resolve(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)));
    });
  });
}

/** In-place iterative radix-2 FFT (real input in re, zeros in im). */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/**
 * Tempo via spectral-flux onset envelope + autocorrelation (70–180 BPM), beat phase by grid alignment,
 * plus the loudest `windowSec` region. Good enough for cutting a reel on the grid; pass --bpm to override.
 */
export async function analyzeBeat(file: string, windowSec = 30, windowStartHint: number | null = null): Promise<BeatInfo> {
  const x = await decodeMono(file);
  const durationSec = x.length / SR;
  const frame = 1024;
  const hop = 512;
  const nf = Math.max(1, Math.floor((x.length - frame) / hop));
  const win = new Float64Array(frame);
  for (let i = 0; i < frame; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1));
  const re = new Float64Array(frame);
  const im = new Float64Array(frame);
  let prev: Float64Array | null = null;
  const flux = new Float64Array(nf);
  for (let f = 0; f < nf; f++) {
    for (let i = 0; i < frame; i++) {
      re[i] = x[f * hop + i]! * win[i]!;
      im[i] = 0;
    }
    fft(re, im);
    const mag = new Float64Array(frame / 2);
    for (let i = 0; i < frame / 2; i++) mag[i] = Math.hypot(re[i]!, im[i]!);
    if (prev) {
      let s = 0;
      for (let i = 0; i < mag.length; i++) s += Math.max(0, mag[i]! - prev[i]!);
      flux[f] = s;
    }
    prev = mag;
  }
  // remove local mean
  const k = 32;
  const smooth = new Float64Array(nf);
  let acc = 0;
  for (let i = 0; i < nf; i++) {
    acc += flux[i]!;
    if (i >= k) acc -= flux[i - k]!;
    smooth[i] = Math.max(0, flux[i]! - acc / Math.min(k, i + 1));
  }
  const fps = SR / hop;
  let bestLag = Math.round((60 * fps) / 120);
  let bestVal = -1;
  const minLag = Math.floor((60 * fps) / 180);
  const maxLag = Math.ceil((60 * fps) / 70);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < nf; i++) s += smooth[i]! * smooth[i - lag]!;
    if (s > bestVal) {
      bestVal = s;
      bestLag = lag;
    }
  }
  const bpm = (60 * fps) / bestLag;
  const beatSec = 60 / bpm;

  // loudest window by RMS per second
  const secs = Math.floor(durationSec);
  const rms = new Float64Array(secs);
  for (let s = 0; s < secs; s++) {
    let e = 0;
    for (let i = s * SR; i < (s + 1) * SR; i++) e += x[i]! * x[i]!;
    rms[s] = Math.sqrt(e / SR);
  }
  let loudestStart = 0;
  let loudest = -1;
  for (let s = 0; s + windowSec <= secs; s++) {
    let m = 0;
    for (let i = s; i < s + windowSec; i++) m += 20 * Math.log10(rms[i]! + 1e-9);
    if (m > loudest) {
      loudest = m;
      loudestStart = s;
    }
  }

  // beat phase near the window of interest
  const around = windowStartHint ?? loudestStart;
  const startF = Math.floor(around * fps);
  let bestPhase = 0;
  let bestSum = -1;
  for (let p = 0; p < bestLag; p++) {
    let s = 0;
    for (let g = startF + p; g < Math.min(nf, startF + 16 * fps); g += bestLag) s += smooth[g]!;
    if (s > bestSum) {
      bestSum = s;
      bestPhase = p;
    }
  }
  const firstBeat = (startF + bestPhase) / fps;
  return { bpm, beatSec, firstBeat, loudestStart, durationSec };
}

/** Nearest grid time at or before t. */
export function snapToBeat(t: number, beatSec: number, firstBeat: number, mode: 'floor' | 'nearest' = 'nearest'): number {
  const n = (t - firstBeat) / beatSec;
  const k = mode === 'floor' ? Math.floor(n) : Math.round(n);
  return firstBeat + k * beatSec;
}
