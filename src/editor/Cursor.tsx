import React from 'react';

/**
 * A plain block cursor with the collaborator's name tag, like a shared editor.
 * No glow: the only motion is the blink and a one-frame brightness tick per keystroke.
 */
export const Cursor: React.FC<{ color: string; on: boolean; em?: number; label?: string | null; kick?: number; flare?: number; sparkAge?: number | null; sparkColor?: string; seed?: string }> = ({ color, on, em = 1, label = null, kick = 0 }) => (
  <span style={{ position: 'relative', display: 'inline-block' }}>
    {label ? (
      <span
        style={{
          position: 'absolute',
          left: `${0.55 * em}em`,
          top: `${-0.92 * em}em`,
          fontSize: `${0.32 * em}em`,
          lineHeight: 1,
          padding: '0.3em 0.5em',
          borderRadius: '0.25em',
          background: color,
          color: '#fff',
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    ) : null}
    <span
      style={{
        display: 'inline-block',
        width: `${0.58 * em}em`,
        height: `${1.12 * em}em`,
        marginLeft: `${0.06 * em}em`,
        verticalAlign: '-0.2em',
        background: color,
        opacity: on ? 1 : 0,
        filter: kick > 0 ? `brightness(${1 + kick * 0.25})` : undefined,
      }}
    />
  </span>
);
