import { promises as fs } from 'node:fs';
import path from 'node:path';
import { rng } from '../lib/seed';
import type { Storyboard } from '../schema/storyboard';
import { keyFrames, type Timeline } from '../schema/timeline';

/**
 * Dependency-free procedural sound design. Produces two 48 kHz / 16-bit / stereo stems:
 *   bed.wav : brown-noise room tone + detuned drone with slow LFO (+ optional music)
 *   sfx.wav : typing clicks at typed-character frames, soft noise whooshes at cuts
 */

export const SAMPLE_RATE = 48_000;

type Stereo = { left: Float32Array; right: Float32Array };

function silence(seconds: number): Stereo {
  const n = Math.ceil(seconds * SAMPLE_RATE);
  return { left: new Float32Array(n), right: new Float32Array(n) };
}

function writeWav(file: string, s: Stereo): Promise<void> {
  const n = s.left.length;
  const bytesPerSample = 2;
  const channels = 2;
  const dataBytes = n * channels * bytesPerSample;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * channels * bytesPerSample, 28);
  buf.writeUInt16LE(channels * bytesPerSample, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, s.left[i] as number));
    const r = Math.max(-1, Math.min(1, s.right[i] as number));
    buf.writeInt16LE(Math.round(l * 32767), o);
    buf.writeInt16LE(Math.round(r * 32767), o + 2);
    o += 4;
  }
  return fs.writeFile(file, buf);
}

const dbToGain = (db: number) => Math.pow(10, db / 20);

/** Normalize so the RMS of the louder channel hits targetDb (and peaks never exceed -1 dBFS). */
function normalizeRms(s: Stereo, targetDb: number, peakCeilDb = -1): void {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < s.left.length; i++) {
    const l = s.left[i] as number;
    const r = s.right[i] as number;
    sum += l * l + r * r;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
  }
  const rms = Math.sqrt(sum / (2 * s.left.length)) || 1e-9;
  let gain = dbToGain(targetDb) / rms;
  if (peak * gain > dbToGain(peakCeilDb)) gain = dbToGain(peakCeilDb) / peak;
  for (let i = 0; i < s.left.length; i++) {
    s.left[i] = (s.left[i] as number) * gain;
    s.right[i] = (s.right[i] as number) * gain;
  }
}

const MOOD_ROOT: Record<Storyboard['audio']['mood'], number> = { warm: 55, cold: 49, dusty: 41.2 }; // A1, G1, E1

function addBed(out: Stereo, sb: Storyboard, seconds: number): void {
  const r = rng(sb.seed, 'bed');
  const n = out.left.length;
  // Brown noise (integrated white) per channel, with a gentle one-pole low-pass.
  let bl = 0;
  let br = 0;
  let lpL = 0;
  let lpR = 0;
  const root = MOOD_ROOT[sb.audio.mood];
  const detune = 1.004;
  const fifth = root * 1.5;
  const lfoRate = 0.1;
  const lfoPhase = r() * Math.PI * 2;
  const vibRate = 0.23;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const wl = (r() * 2 - 1) * 0.02;
    const wr = (r() * 2 - 1) * 0.02;
    bl = (bl + wl) * 0.995;
    br = (br + wr) * 0.995;
    lpL += (bl - lpL) * 0.05;
    lpR += (br - lpR) * 0.05;
    const lfo = 0.6 + 0.4 * Math.sin(t * lfoRate * Math.PI * 2 + lfoPhase);
    const vib = 1 + 0.0015 * Math.sin(t * vibRate * Math.PI * 2);
    const drone =
      Math.sin(2 * Math.PI * root * vib * t) * 0.5 +
      Math.sin(2 * Math.PI * root * detune * t) * 0.35 +
      Math.sin(2 * Math.PI * fifth * t + 0.3) * 0.18 +
      Math.sin(2 * Math.PI * root * 2 * t) * 0.12 * (0.5 + 0.5 * Math.sin(t * 0.07 * Math.PI * 2));
    const swell = Math.min(1, t / 2.5) * Math.min(1, (seconds - t) / 2.5);
    out.left[i] = (out.left[i] as number) + lpL * 2.2 + drone * 0.09 * lfo * swell;
    out.right[i] = (out.right[i] as number) + lpR * 2.2 + drone * 0.09 * (1.2 - lfo * 0.5) * swell;
  }
}

/** Short filtered noise burst — a soft mechanical key. */
function addClick(out: Stereo, at: number, r: () => number, gain: number): void {
  const start = Math.floor(at * SAMPLE_RATE);
  const len = Math.floor(SAMPLE_RATE * (0.022 + r() * 0.014));
  const pan = 0.4 + r() * 0.2;
  const tone = 1800 + r() * 1400;
  let lp = 0;
  for (let i = 0; i < len && start + i < out.left.length; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-i / (len * 0.28)) * Math.min(1, i / 24);
    const noise = (r() * 2 - 1);
    lp += (noise - lp) * 0.35;
    const body = Math.sin(2 * Math.PI * tone * t) * Math.exp(-i / (len * 0.08)) * 0.5;
    const v = (lp * 0.8 + body) * env * gain;
    out.left[start + i] = (out.left[start + i] as number) + v * (1 - pan);
    out.right[start + i] = (out.right[start + i] as number) + v * pan;
  }
}

/** Air-like noise sweep across a cut. */
function addWhoosh(out: Stereo, at: number, r: () => number, gain: number): void {
  const len = Math.floor(SAMPLE_RATE * 0.55);
  const start = Math.max(0, Math.floor(at * SAMPLE_RATE) - Math.floor(len * 0.45));
  let lp = 0;
  const dir = r() > 0.5 ? 1 : -1;
  for (let i = 0; i < len && start + i < out.left.length; i++) {
    const p = i / len;
    const env = Math.sin(p * Math.PI) ** 2;
    const cutoff = 0.02 + 0.3 * Math.sin(p * Math.PI);
    const noise = r() * 2 - 1;
    lp += (noise - lp) * cutoff;
    const v = lp * env * gain;
    const pan = 0.5 + dir * (p - 0.5) * 0.6;
    out.left[start + i] = (out.left[start + i] as number) + v * (1 - pan);
    out.right[start + i] = (out.right[start + i] as number) + v * pan;
  }
}

export type SynthResult = { bed: string; sfx: string; seconds: number };

export type SynthOptions = { whooshes?: boolean; clickGain?: number };

export async function synthesizeStems(sb: Storyboard, timeline: Timeline, outDir: string, options: SynthOptions = {}): Promise<SynthResult> {
  await fs.mkdir(outDir, { recursive: true });
  const seconds = timeline.totalFrames / timeline.fps;

  const bed = silence(seconds);
  addBed(bed, sb, seconds);
  normalizeRms(bed, -24, -8);

  const sfx = silence(seconds);
  const r = rng(sb.seed, 'sfx');
  const clickGain = (0.35 + sb.audio.typingDensity * 0.5) * (options.clickGain ?? 1);
  // Hook (chorus) lines hit harder on the keys.
  const hookFrames = new Set<number>();
  for (const sc of timeline.scenes) for (const pl of sc.lyrics) if (pl.fx === 'predict') for (const k of keyFrames(pl)) hookFrames.add(sc.from + k);
  for (const f of timeline.typingFrames) addClick(sfx, f / timeline.fps, r, clickGain * (0.8 + r() * 0.4) * (hookFrames.has(f) ? 1.7 : 1));
  if (options.whooshes !== false) for (const f of timeline.cuts) addWhoosh(sfx, f / timeline.fps, r, 0.5);
  normalizeRms(sfx, -28, -14);

  const bedPath = path.join(outDir, 'bed.wav');
  const sfxPath = path.join(outDir, 'sfx.wav');
  await Promise.all([writeWav(bedPath, bed), writeWav(sfxPath, sfx)]);
  return { bed: bedPath, sfx: sfxPath, seconds };
}
