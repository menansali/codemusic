import React from 'react';
import { Easing, interpolate } from 'remotion';

/**
 * The frame split along the yin-yang S-curve; one side is inverted (difference blend), so the code
 * itself becomes the two halves. Dots are the opposite colour of their half (evenodd hole + extra disc).
 * Screen-space, no glow: it reads as graphic design, not a clip-art symbol.
 */
export const YinYangSplit: React.FC<{ age: number; width: number; height: number }> = ({ age, width, height }) => {
  if (age < 0) return null;
  const cx = width / 2;
  const cy = height / 2;
  const R = height / 4;
  const big = height * 2;
  const dot = R / 7;
  // Lands with a short turn, then keeps turning very slowly.
  const settle = interpolate(age, [0, 12], [-32, 0], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const rot = settle + age * 0.12;
  const circle = (x: number, y: number, r: number) => `M ${x - r},${y} a ${r},${r} 0 1 0 ${2 * r},0 a ${r},${r} 0 1 0 ${-2 * r},0 Z`;
  const half =
    `M ${cx},${-big} L ${cx},${cy - 2 * R} A ${R} ${R} 0 0 1 ${cx},${cy} A ${R} ${R} 0 0 0 ${cx},${cy + 2 * R} ` +
    `L ${cx},${big} L ${big},${big} L ${big},${-big} Z ` +
    // Dark dot inside the light half (a hole), light dot inside the dark half.
    circle(cx, cy + R, dot) +
    ' ' +
    circle(cx, cy - R, dot);
  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0, mixBlendMode: 'difference', pointerEvents: 'none' }}>
      <path d={half} fill="#ffffff" fillRule="evenodd" transform={`rotate(${rot.toFixed(2)} ${cx} ${cy})`} />
    </svg>
  );
};
