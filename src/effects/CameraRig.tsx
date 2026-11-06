import React from 'react';
import { Easing, interpolate } from 'remotion';
import type { Camera } from '../schema/storyboard';

export type CameraState = { zoom: number; px: number; py: number; tilt: number; focus: number };

const ease = Easing.bezier(0.16, 1, 0.3, 1);

/** Interpolate a camera over scene progress (0..1). Focus point is in content coordinates. */
export type FocusRect = { x0: number; y0: number; x1: number; y1: number };

export function cameraAt(camera: Camera, progress: number, contentWidth: number, contentHeight: number, rect?: FocusRect): CameraState {
  const p = interpolate(progress, [0, 1], [0, 1], { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lerp = (a: number, b: number) => a + (b - a) * p;
  const r = rect ?? { x0: 0, y0: 0, x1: contentWidth, y1: contentHeight };
  return {
    zoom: lerp(camera.zoomFrom, camera.zoomTo),
    px: r.x0 + ((lerp(camera.panFrom.x, camera.panTo.x) + 1) / 2) * (r.x1 - r.x0),
    py: r.y0 + ((lerp(camera.panFrom.y, camera.panTo.y) + 1) / 2) * (r.y1 - r.y0),
    tilt: camera.tiltDeg,
    focus: lerp(camera.focusFrom, camera.focusTo),
  };
}

/**
 * Frames an oversized content layer. zoom 1 fits the content width to the viewport width;
 * the focus point (px, py) lands on the viewport centre; the whole view is tilted around centre.
 */
export const CameraRig: React.FC<{
  state: CameraState;
  contentWidth: number;
  contentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Extra subtle handheld sway amplitude in px (0 disables). */
  sway?: { x: number; y: number };
  children: React.ReactNode;
}> = ({ state, contentWidth, viewportWidth, viewportHeight, sway, children }) => {
  const base = viewportWidth / contentWidth;
  const scale = base * state.zoom;
  const tx = viewportWidth / 2 - state.px * scale + (sway?.x ?? 0);
  const ty = viewportHeight / 2 - state.py * scale + (sway?.y ?? 0);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', transform: `rotate(${state.tilt}deg)`, transformOrigin: '50% 50%' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${scale})`, willChange: 'transform' }}>
        {children}
      </div>
    </div>
  );
};
