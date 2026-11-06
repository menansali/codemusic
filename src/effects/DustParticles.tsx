import React, { useMemo } from 'react';
import { rng } from '../lib/seed';

type Mote = { x: number; y: number; r: number; speed: number; drift: number; phase: number; alpha: number };

/** Slow-drifting dust motes. One SVG, group-level blur, seeded positions. */
export const DustParticles: React.FC<{ density: number; seed: number; frame: number; fps: number; width: number; height: number }> = ({ density, seed, frame, fps, width, height }) => {
  const motes = useMemo<Mote[]>(() => {
    const r = rng(seed, 'dust');
    const count = Math.round(80 * density);
    return Array.from({ length: count }, () => ({
      x: r() * width,
      y: r() * height,
      r: 1.2 + r() * 3.2,
      speed: 6 + r() * 18,
      drift: (r() - 0.5) * 14,
      phase: r() * Math.PI * 2,
      alpha: 0.25 + r() * 0.55,
    }));
  }, [density, seed, width, height]);
  if (density <= 0.01) return null;
  const t = frame / fps;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.8 }}>
      <defs>
        <filter id="dustBlur">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
      </defs>
      <g filter="url(#dustBlur)" fill="#ffd9a8">
        {motes.map((m, i) => {
          const y = ((m.y - t * m.speed) % height + height) % height;
          const x = m.x + Math.sin(t * 0.6 + m.phase) * m.drift;
          const twinkle = 0.6 + 0.4 * Math.sin(t * 1.7 + m.phase * 3);
          return <circle key={i} cx={x} cy={y} r={m.r} opacity={m.alpha * twinkle} />;
        })}
      </g>
    </svg>
  );
};
