import React from 'react';

export const Vignette: React.FC<{ strength: number }> = ({ strength }) => {
  if (strength <= 0.01) return null;
  const inner = 42 + (1 - strength) * 25;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `radial-gradient(ellipse 80% 70% at 50% 48%, rgba(0,0,0,0) ${inner}%, rgba(0,0,0,${0.35 + strength * 0.4}) 100%)`,
      }}
    />
  );
};
