import { useCurrentFrame, useVideoConfig } from 'remotion';
import { cameraAt, type CameraState } from '../effects/CameraRig';
import type { Camera } from '../schema/storyboard';
import type { SceneTiming } from '../schema/timeline';
import { EDITOR } from '../editor/theme';

export function useSceneClock(timing: SceneTiming) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const progress = Math.min(1, Math.max(0, frame / Math.max(1, timing.durationInFrames - 1)));
  return { frame, fps, width, height, progress, t: frame / fps };
}

/** Subtle handheld sway in viewport pixels. */
export function sway(t: number, seed: number, amount = 1): { x: number; y: number } {
  const s = (seed % 97) / 97;
  return {
    x: (Math.sin(t * 0.55 + s * 6) * 3.5 + Math.sin(t * 1.3 + s * 2) * 1.2) * amount,
    y: (Math.cos(t * 0.42 + s * 4) * 2.5 + Math.sin(t * 1.1 + s) * 1) * amount,
  };
}

export function editorCamera(camera: Camera, progress: number): CameraState {
  return cameraAt(camera, progress, EDITOR.width, EDITOR.height, EDITOR.focusRect);
}
