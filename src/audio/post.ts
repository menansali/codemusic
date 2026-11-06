import { spawn } from 'node:child_process';

export const ffmpegBin = (): string => process.env.FFMPEG_PATH || 'ffmpeg';
export const ffprobeBin = (): string => process.env.FFPROBE_PATH || 'ffprobe';

export function run(bin: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

const LN = { I: -16, TP: -2, LRA: 11 };
/** Brick-wall ceiling applied after loudnorm, before the AAC encoder (which can overshoot ~1 dB). */
const LIMITER = 'alimiter=limit=0.708:attack=4:release=120:level=false';

type Measured = { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string };

/**
 * Two-pass EBU R128 loudness normalization. Video stream is copied untouched, audio re-encoded to AAC,
 * and the moov atom moved to the front for instant playback start.
 */
export async function loudnormAndFaststart(input: string, output: string): Promise<{ measured: Measured | null }> {
  const base = `loudnorm=I=${LN.I}:TP=${LN.TP}:LRA=${LN.LRA}`;
  const pass1 = await run(ffmpegBin(), ['-hide_banner', '-nostats', '-i', input, '-af', `${base}:print_format=json`, '-f', 'null', '-']);
  let measured: Measured | null = null;
  const m = pass1.stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (m) {
    try {
      measured = JSON.parse(m[0]) as Measured;
    } catch {
      measured = null;
    }
  }
  const af = measured
    ? `${base}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=summary,${LIMITER}`
    : `${base}:print_format=summary,${LIMITER}`;
  const pass2 = await run(ffmpegBin(), ['-hide_banner', '-nostats', '-y', '-i', input, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-af', af, '-movflags', '+faststart', output]);
  if (pass2.code !== 0) throw new Error(`ffmpeg loudnorm failed (${pass2.code}):\n${pass2.stderr.slice(-2000)}`);
  return { measured };
}

/** Decode a user-supplied music file into a trimmed, faded 48 kHz stereo WAV stem. */
export async function prepareMusic(src: string, outWav: string, seconds: number, startSec = 0, song = false): Promise<void> {
  const fadeOutStart = Math.max(0, seconds - (song ? 2.2 : 3.5));
  const af = song ? `afade=t=in:d=0.25,afade=t=out:st=${fadeOutStart}:d=2.2` : `afade=t=in:d=2,afade=t=out:st=${fadeOutStart}:d=3.5,volume=-6dB`;
  const res = await run(ffmpegBin(), ['-hide_banner', '-nostats', '-y', '-ss', String(Math.max(0, startSec)), '-i', src, '-t', String(seconds), '-ac', '2', '-ar', '48000', '-af', af, '-c:a', 'pcm_s16le', outWav]);
  if (res.code !== 0) throw new Error(`ffmpeg music prep failed:\n${res.stderr.slice(-1500)}`);
}
