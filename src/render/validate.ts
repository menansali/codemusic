import { promises as fs } from 'node:fs';
import { ffprobeBin, run } from '../audio/post';

export type ProbeResult = {
  width: number;
  height: number;
  frameRate: string;
  codec: string;
  nbFrames: number | null;
  duration: number;
  audioCodec: string | null;
  audioSampleRate: number | null;
  sizeBytes: number;
};

export async function probe(file: string): Promise<ProbeResult> {
  const res = await run(ffprobeBin(), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
  if (res.code !== 0) throw new Error(`ffprobe failed: ${res.stderr}`);
  const json = JSON.parse(res.stdout) as { streams: Record<string, unknown>[]; format: Record<string, unknown> };
  const v = json.streams.find((s) => s.codec_type === 'video');
  const a = json.streams.find((s) => s.codec_type === 'audio');
  if (!v) throw new Error('No video stream found');
  const stat = await fs.stat(file);
  return {
    width: Number(v.width),
    height: Number(v.height),
    frameRate: String(v.r_frame_rate),
    codec: String(v.codec_name),
    nbFrames: v.nb_frames ? Number(v.nb_frames) : null,
    duration: v.duration ? Number(v.duration) : Number(json.format.duration),
    audioCodec: a ? String(a.codec_name) : null,
    audioSampleRate: a ? Number(a.sample_rate) : null,
    sizeBytes: stat.size,
  };
}

export type Expectation = { width: number; height: number; fps: number; durationSec: number; frames: number };

export function validateProbe(p: ProbeResult, e: Expectation): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (p.codec !== 'h264') errors.push(`video codec is ${p.codec}, expected h264`);
  if (p.width !== e.width || p.height !== e.height) errors.push(`resolution is ${p.width}x${p.height}, expected ${e.width}x${e.height}`);
  if (p.frameRate !== `${e.fps}/1`) errors.push(`frame rate is ${p.frameRate}, expected ${e.fps}/1`);
  if (p.nbFrames !== null && p.nbFrames !== e.frames) errors.push(`frame count is ${p.nbFrames}, expected ${e.frames}`);
  if (Math.abs(p.duration - e.durationSec) > 0.12) errors.push(`duration is ${p.duration.toFixed(3)}s, expected ${e.durationSec.toFixed(3)}s ±0.12`);
  if (!p.audioCodec) errors.push('no audio stream');
  else if (p.audioCodec !== 'aac') errors.push(`audio codec is ${p.audioCodec}, expected aac`);
  return { ok: errors.length === 0, errors };
}
