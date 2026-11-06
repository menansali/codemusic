import type { X264Preset } from '@remotion/renderer';

export const VIDEO = { width: 1080, height: 1920, fps: 30 } as const;

export type RenderQuality = 'final' | 'draft';

export function renderSettings(quality: RenderQuality) {
  const env = typeof process !== 'undefined' ? process.env : {};
  const concurrency = env.RENDER_CONCURRENCY ? Number(env.RENDER_CONCURRENCY) : 6;
  return {
    codec: 'h264' as const,
    audioCodec: 'aac' as const,
    audioBitrate: '192k' as const,
    enforceAudioTrack: true,
    imageFormat: 'jpeg' as const,
    jpegQuality: quality === 'final' ? 95 : 80,
    crf: quality === 'final' ? 17 : 23,
    x264Preset: (quality === 'final' ? 'slow' : 'veryfast') as X264Preset,
    concurrency,
    colorSpace: 'bt709' as const,
    timeoutInMilliseconds: 90_000,
  };
}
