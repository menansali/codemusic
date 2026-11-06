import React from 'react';
import { Audio } from '@remotion/media';
import { interpolate, staticFile, useVideoConfig } from 'remotion';

/**
 * At most three stems: bed (room tone + drone + optional music), sfx (clicks + whooshes).
 * audioDir is relative to public/, e.g. "audio/<id>". null = silent (Studio without generated audio).
 */
export type AudioMix = { bed: number; sfx: number; music: number };

export const AudioLayers: React.FC<{ audioDir: string | null; hasMusic?: boolean; totalFrames: number; mix?: AudioMix }> = ({ audioDir, hasMusic = false, totalFrames, mix }) => {
  const { fps } = useVideoConfig();
  if (!audioDir) return null;
  const m = mix ?? { bed: 1, sfx: 1, music: 0.7 };
  const fadeIn = fps * (hasMusic && m.music >= 0.9 ? 0.2 : 1.2);
  const fadeOut = fps * 1.6;
  const env = (f: number, gain: number) =>
    gain *
    interpolate(f, [0, fadeIn, totalFrames - fadeOut, totalFrames - 1], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <>
      <Audio name="Bed" src={staticFile(`${audioDir}/bed.wav`)} premountFor={fps} volume={(f) => env(f, m.bed)} disallowFallbackToHtml5Audio />
      <Audio name="SFX" src={staticFile(`${audioDir}/sfx.wav`)} premountFor={fps} volume={(f) => env(f, m.sfx)} disallowFallbackToHtml5Audio />
      {hasMusic ? <Audio name="Music" src={staticFile(`${audioDir}/music.wav`)} premountFor={fps} volume={(f) => env(f, m.music)} disallowFallbackToHtml5Audio /> : null}
    </>
  );
};
