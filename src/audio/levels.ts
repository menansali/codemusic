import { spawn } from 'node:child_process';
import { ffmpegBin } from './post';

/** Per-video-frame loudness 0..1 of a WAV/MP3, normalised to its 95th percentile, lightly smoothed. */
export async function frameLevels(file: string, fps: number, frames: number, startSec = 0): Promise<number[]> {
  const sr = 48000;
  const x = await new Promise<Float32Array>((resolve, reject) => {
    const child = spawn(ffmpegBin(), ['-v', 'error', '-ss', String(startSec), '-t', String(frames / fps + 0.1), '-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-']);
    const chunks: Buffer[] = [];
    child.stdout.on('data', (d: Buffer) => chunks.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg decode failed (${code})`));
      const buf = Buffer.concat(chunks);
      resolve(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)));
    });
  });
  const hop = sr / fps;
  const raw: number[] = [];
  for (let f = 0; f < frames; f++) {
    let e = 0;
    const a = Math.floor(f * hop);
    const b = Math.min(x.length, Math.floor((f + 1) * hop));
    for (let i = a; i < b; i++) e += x[i]! * x[i]!;
    raw.push(Math.sqrt(e / Math.max(1, b - a)));
  }
  const sorted = [...raw].sort((p, q) => p - q);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1;
  // attack fast, release slow, so visuals hit on transients and decay musically
  const out: number[] = [];
  let env = 0;
  for (const v of raw) {
    const n = Math.min(1, v / p95);
    env = n > env ? env + (n - env) * 0.6 : env + (n - env) * 0.12;
    out.push(env);
  }
  return out;
}

/** Reel times (seconds) where energy jumps: mean of the next 0.5 s is far above the previous 1 s. */
export function findDrops(levels: number[], fps: number): number[] {
  const drops: number[] = [];
  const pre = Math.round(fps);
  const post = Math.round(fps * 0.5);
  let last = -1e9;
  for (let f = pre; f < levels.length - post; f++) {
    let a = 0;
    let b = 0;
    for (let i = f - pre; i < f; i++) a += levels[i]!;
    for (let i = f; i < f + post; i++) b += levels[i]!;
    a /= pre;
    b /= post;
    if (b > 0.55 && b > a * 1.7 && f - last > fps * 4) {
      drops.push(f / fps);
      last = f;
    }
  }
  return drops;
}

/**
 * Kick drums: energy of a ~120 Hz low-passed signal per frame, onset when it jumps well above the
 * recent average. Returns reel frames, at least ~0.2 s apart.
 */
export async function kickFrames(file: string, fps: number, frames: number, startSec = 0): Promise<number[]> {
  return bandOnsets(file, fps, frames, startSec, 'lowpass=f=120,lowpass=f=120', { floorPct: 0.6, ratio: 1.45, gapSec: 0.2 });
}

/**
 * Snares and claps: the 1.8-5.5 kHz band (above the kick, below most hi-hat sizzle), stricter than the
 * kick so steady hats do not count. Reel frames, at least ~0.28 s apart.
 */
export async function snareFrames(file: string, fps: number, frames: number, startSec = 0): Promise<number[]> {
  return bandOnsets(file, fps, frames, startSec, 'highpass=f=1800,highpass=f=1800,lowpass=f=5500', { floorPct: 0.7, ratio: 1.7, gapSec: 0.28 });
}

async function bandOnsets(file: string, fps: number, frames: number, startSec: number, filter: string, o: { floorPct: number; ratio: number; gapSec: number }): Promise<number[]> {
  const sr = 24000;
  const x = await new Promise<Float32Array>((resolve, reject) => {
    const child = spawn(ffmpegBin(), ['-v', 'error', '-ss', String(startSec), '-t', String(frames / fps + 0.1), '-i', file, '-ac', '1', '-ar', String(sr), '-af', filter, '-f', 'f32le', '-']);
    const chunks: Buffer[] = [];
    child.stdout.on('data', (d: Buffer) => chunks.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg decode failed (${code})`));
      const buf = Buffer.concat(chunks);
      resolve(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)));
    });
  });
  const hop = sr / fps;
  const e: number[] = [];
  for (let f = 0; f < frames; f++) {
    let s = 0;
    const a = Math.floor(f * hop);
    const b = Math.min(x.length, Math.floor((f + 1) * hop));
    for (let i = a; i < b; i++) s += x[i]! * x[i]!;
    e.push(s / Math.max(1, b - a));
  }
  const sorted = [...e].sort((p, q) => p - q);
  const floor = sorted[Math.floor(sorted.length * o.floorPct)] ?? 0;
  const out: number[] = [];
  let last = -1e9;
  for (let f = 4; f < frames; f++) {
    let avg = 0;
    for (let i = f - 4; i < f; i++) avg += e[i]!;
    avg /= 4;
    if (e[f]! > floor && e[f]! > avg * o.ratio && e[f]! >= (e[f - 1] ?? 0) && f - last >= Math.round(fps * o.gapSec)) {
      out.push(f);
      last = f;
    }
  }
  return out;
}
