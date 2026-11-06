import React from 'react';

/** Procedural beetle. Legs cycle with the walk phase; heading in degrees (0 = facing up). */
export const Beetle: React.FC<{ x: number; y: number; size: number; heading: number; walkPhase: number; opacity?: number }> = ({ x, y, size, heading, walkPhase, opacity = 1 }) => {
  const legs = [-1, 0, 1];
  const legSwing = (i: number, side: number) => Math.sin(walkPhase * 2 + i * 2.1 + (side > 0 ? Math.PI : 0)) * 14;
  return (
    <div style={{ position: 'absolute', left: x - size / 2, top: y - size * 0.7, width: size, height: size * 1.4, transform: `rotate(${heading}deg)`, transformOrigin: '50% 50%', opacity }}>
      <svg viewBox="0 0 100 140" width={size} height={size * 1.4} style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id="beetleShell" cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#e8d8c0" />
            <stop offset="35%" stopColor="#8a5a3a" />
            <stop offset="100%" stopColor="#1e120b" />
          </radialGradient>
          <radialGradient id="beetleHead" cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#c9a27a" />
            <stop offset="100%" stopColor="#1a0f08" />
          </radialGradient>
          <filter id="beetleShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <pattern id="beetleDots" patternUnits="userSpaceOnUse" width="9" height="9">
            <circle cx="4.5" cy="4.5" r="1.7" fill="#f5e4cc" opacity="0.75" />
          </pattern>
        </defs>
        {/* shadow */}
        <ellipse cx="54" cy="84" rx="28" ry="40" fill="#000" opacity="0.6" filter="url(#beetleShadow)" />
        {/* legs */}
        <g stroke="#2a1a10" strokeWidth="3.2" strokeLinecap="round" fill="none">
          {legs.map((i) =>
            [-1, 1].map((side) => {
              const baseY = 62 + i * 18;
              const sw = legSwing(i, side);
              const x1 = 50 + side * 18;
              const x2 = 50 + side * (40 + Math.abs(sw) * 0.2);
              const y2 = baseY - 14 + sw;
              const x3 = 50 + side * 52;
              const y3 = baseY + 10 + sw * 0.6;
              return <path key={`${i}${side}`} d={`M ${x1} ${baseY} Q ${x2} ${y2} ${x3} ${y3}`} />;
            }),
          )}
        </g>
        {/* antennae */}
        <g stroke="#3a2416" strokeWidth="2.4" strokeLinecap="round" fill="none">
          <path d={`M 44 30 Q ${34 + Math.sin(walkPhase) * 3} 10 ${26 + Math.sin(walkPhase * 1.3) * 4} 2`} />
          <path d={`M 56 30 Q ${66 - Math.sin(walkPhase) * 3} 10 ${74 - Math.sin(walkPhase * 1.3) * 4} 2`} />
        </g>
        {/* body */}
        <ellipse cx="50" cy="80" rx="27" ry="42" fill="url(#beetleShell)" />
        <ellipse cx="50" cy="80" rx="27" ry="42" fill="url(#beetleDots)" opacity="0.9" />
        <line x1="50" y1="44" x2="50" y2="120" stroke="#120a06" strokeWidth="1.6" opacity="0.8" />
        <ellipse cx="50" cy="42" rx="16" ry="14" fill="url(#beetleHead)" />
        <ellipse cx="50" cy="30" rx="10" ry="8" fill="#241610" />
        {/* highlight */}
        <ellipse cx="40" cy="62" rx="8" ry="16" fill="#fff" opacity="0.16" />
      </svg>
    </div>
  );
};
