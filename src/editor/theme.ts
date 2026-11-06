export const FONT_FAMILY = "'JetBrains Mono', 'SF Mono', Menlo, monospace";

/** Editor canvas is rendered oversized and framed by the camera rig. */
export const EDITOR = {
  width: 2200,
  height: 3200,
  fontSize: 78,
  lineHeight: 1.6,
  gutterWidth: 190,
  paddingLeft: 60,
  /** Vertical offset where the code block starts inside the canvas. */
  codeTop: 1180,
  tabBarHeight: 110,
  /** Region the camera pan range maps onto (where the code actually lives). */
  focusRect: { x0: 160, y0: 980, x1: 1700, y1: 2100 },
} as const;

export const COLORS = {
  bg: '#0a0909',
  bgPanel: '#110f0f',
  gutter: '#5a534f',
  text: '#f4eee5',
  textDim: '#aaa096',
  call: '#f2b43f',
  string: '#ff9a3c',
  comment: '#6b645f',
  number: '#ffb86b',
  punct: '#bdb4ab',
  warningBorder: '#e9a93a',
  warningBg: '#2a1c07',
  warningText: '#f7c45b',
  popupBg: '#17140f',
  popupBorder: '#3a332b',
} as const;

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type EditorColors = { [K in keyof typeof COLORS]: string };

import { createContext, useContext } from 'react';

/** Active colour theme. Vibes provide their own; topic reels use the default dark theme. */
export const ThemeContext = createContext<EditorColors>(COLORS);
export const useColors = (): EditorColors => useContext(ThemeContext);
