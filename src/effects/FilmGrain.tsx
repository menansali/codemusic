import React from 'react';
import { random } from 'remotion';

/**
 * Film grain: feTurbulence runs on a 256px tile only; the tile is translated per frame with a
 * seeded offset so grain never looks static. Composited as overlay against the whole frame.
 */
export const FilmGrain: React.FC<{ intensity: number; seed: number; frame: number; width: number; height: number }> = ({ intensity, seed, frame, width, height }) => {
  if (intensity <= 0.01) return null;
  const ox = Math.floor(random(`${seed}-grain-x-${frame}`) * 256);
  const oy = Math.floor(random(`${seed}-grain-y-${frame}`) * 256);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', inset: 0, mixBlendMode: 'overlay', opacity: 0.1 + intensity * 0.22, pointerEvents: 'none' }}
    >
      <defs>
        <filter id="grainNoise" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed % 1000} stitchTiles="stitch" result="noise" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="1.4" intercept="-0.2" />
          </feComponentTransfer>
        </filter>
        <pattern id="grainTile" patternUnits="userSpaceOnUse" width="256" height="256" patternTransform={`translate(${ox} ${oy})`}>
          <rect width="256" height="256" filter="url(#grainNoise)" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#grainTile)" />
    </svg>
  );
};
