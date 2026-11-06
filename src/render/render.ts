import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import type { ReelProps } from '../composition/Reel';
import { renderSettings, type RenderQuality } from '../lib/renderSettings';

export const ROOT = process.cwd();

/**
 * Which Chrome renders the frames. The default headless shell hangs on this macOS release while loading
 * web fonts, so full Chrome for Testing is used unless REMOTION_CHROME_MODE=headless-shell is set.
 */
export const BROWSER = { chromeMode: (process.env.REMOTION_CHROME_MODE === 'headless-shell' ? 'headless-shell' : 'chrome-for-testing') as 'headless-shell' | 'chrome-for-testing' };

export async function createBundle(onProgress?: (p: number) => void): Promise<string> {
  await ensureBrowser(BROWSER);
  return bundle({
    entryPoint: path.join(ROOT, 'src/index.ts'),
    publicDir: path.join(ROOT, 'public'),
    outDir: path.join(ROOT, '.remotion-bundle'),
    onProgress: (p) => onProgress?.(p),
  });
}

export type RenderJob = {
  serveUrl: string;
  props: ReelProps;
  outputLocation: string;
  quality: RenderQuality;
  onProgress?: (info: { progress: number; renderedFrames: number; encodedFrames: number; stage: string }) => void;
};

export async function renderReel(job: RenderJob): Promise<{ durationInFrames: number; ms: number }> {
  const started = Date.now();
  const settings = renderSettings(job.quality);
  const inputProps = job.props as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl: job.serveUrl, id: 'Reel', inputProps, timeoutInMilliseconds: settings.timeoutInMilliseconds, ...BROWSER });
  await renderMedia({
    ...BROWSER,
    composition,
    serveUrl: job.serveUrl,
    inputProps,
    outputLocation: job.outputLocation,
    codec: settings.codec,
    audioCodec: settings.audioCodec,
    audioBitrate: settings.audioBitrate,
    enforceAudioTrack: settings.enforceAudioTrack,
    imageFormat: settings.imageFormat,
    jpegQuality: settings.jpegQuality,
    crf: settings.crf,
    x264Preset: settings.x264Preset,
    concurrency: settings.concurrency,
    colorSpace: settings.colorSpace,
    timeoutInMilliseconds: settings.timeoutInMilliseconds,
    overwrite: true,
    onProgress: ({ progress, renderedFrames, encodedFrames, stitchStage }) => job.onProgress?.({ progress, renderedFrames, encodedFrames, stage: stitchStage }),
  });
  return { durationInFrames: composition.durationInFrames, ms: Date.now() - started };
}
