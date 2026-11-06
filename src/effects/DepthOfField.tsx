import React from 'react';

/** focus 0..1 → blur px (max 16 keeps Skia cost sane). */
export function focusBlurPx(focus: number, maxBlur = 16): number {
  const f = Math.min(1, Math.max(0, focus));
  return Math.round((1 - f) * (1 - f) * maxBlur * 10) / 10;
}

/** A full-size layer with a blur radius. Never put blend modes on the same element. */
export const BlurLayer: React.FC<{ blurPx: number; opacity?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ blurPx, opacity = 1, children, style }) => (
  <div style={{ position: 'absolute', inset: 0, filter: blurPx > 0.05 ? `blur(${blurPx}px)` : undefined, opacity, ...style }}>{children}</div>
);
