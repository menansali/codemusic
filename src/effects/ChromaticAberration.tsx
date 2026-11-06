import React from 'react';

/** Cheap RGB-split as text-shadow. strength 0..1, scale multiplies the pixel offset. */
export function aberrationShadow(strength: number, scale = 1): string {
  if (strength <= 0.01) return 'none';
  const px = (0.8 + strength * 2.2) * scale;
  const a = 0.25 + strength * 0.4;
  return `${-px}px 0 rgba(255, 40, 40, ${a}), ${px}px 0 rgba(40, 170, 255, ${a})`;
}

/**
 * Hero-scene channel split: two channel-isolated copies of the children, offset and screened,
 * masked so the centre stays clean and the fringe appears towards the edges like a real lens.
 * Children are rendered three times, so keep them deterministic and reasonably small.
 */
export const ChannelSplit: React.FC<{ strength: number; width: number; height: number; children: React.ReactNode }> = ({ strength, width, height, children }) => {
  if (strength <= 0.01) return <>{children}</>;
  const px = 1.5 + strength * 4;
  const mask = 'radial-gradient(ellipse at center, transparent 35%, black 95%)';
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width, height, isolation: 'isolate' }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="keepRed">
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
          </filter>
          <filter id="keepBlue">
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0.4 0 0 0  0 0 1 0 0  0 0 0 1 0" />
          </filter>
        </defs>
      </svg>
      <div style={{ position: 'absolute', inset: 0 }}>{children}</div>
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-px}px)`, filter: 'url(#keepRed)', mixBlendMode: 'screen', WebkitMaskImage: mask, maskImage: mask, opacity: 0.7 }}>
        {children}
      </div>
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${px}px)`, filter: 'url(#keepBlue)', mixBlendMode: 'screen', WebkitMaskImage: mask, maskImage: mask, opacity: 0.7 }}>
        {children}
      </div>
    </div>
  );
};
