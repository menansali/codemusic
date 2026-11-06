import React from 'react';
import { tokenize, type TokenKind } from './highlight';
import { EDITOR, FONT_FAMILY, useColors, withAlpha, type EditorColors } from './theme';
import { Cursor } from './Cursor';
import { aberrationShadow } from '../effects/ChromaticAberration';
import { random } from 'remotion';
import { WordFx, LETTER_FX } from './WordFx';
import type { MarkKind } from '../lyrics/lexicon';

export type MarkKindR = MarkKind | 'find' | 'found';
export type LineMark = { word: string; kind: MarkKindR; age?: number };

export type CodeEditorProps = {
  filename: string;
  code: readonly string[];
  accent: string;
  /** Line index being typed live and how many characters are revealed. */
  typingLine?: number | null;
  typedCount?: number;
  /** What is on the typing line right now, when it differs from a prefix of the final text (a typo). */
  typingText?: string | null;
  /** Index where the wrong characters start on the typing line; they get a spellcheck squiggle. */
  typoFrom?: number | null;
  /** Where the cursor sits when nothing is being typed: end of this line (default last line). */
  cursorLine?: number | null;
  cursorOn: boolean;
  warning?: { line: number; text: string } | null;
  autocomplete?: { line: number; items: readonly string[] } | null;
  /** 0..1 chromatic aberration strength applied as text-shadow. */
  aberration?: number;
  /** Gutter number of the first line. */
  startLine?: number;
  /** Show tab bar. */
  chrome?: boolean;
  fontSize?: number;
  opacity?: number;
  cursorColor?: string;
  cursorLabel?: string | null;
  /** Idle cursors parked at the end of other lines (second collaborator). */
  extraCursors?: { line: number; color: string; label: string | null; on: boolean }[];
  /** Small comment shown to the right of a line, keyed by line index. */
  sideNotes?: Record<number, string>;
  /** Frames since the newest character of the typing line appeared (drives the pop-in). */
  lastCharAge?: number | null;
  /** Inline word decorations per line index. */
  marks?: Record<number, LineMark[]>;
  /** Predicted rest of the typing line, shown as grey ghost text after the cursor. */
  ghost?: string | null;
  /** 0..1 kick/beat envelope (heartbeat words). */
  pulse?: number;
  /** Unused: text is drawn flat. */
  glow?: number;
  /** Extra rows per line: a removed diff line above, duplicated lines below, or a collapsing row (scale < 1). */
  rowExtras?: Record<number, RowExtra>;
  /** 0..1 snare envelope: the line numbers flicker brighter. */
  gutterFlash?: number;
};

export type RowExtra = { above?: string[]; below?: string[]; belowAge?: number; scale?: number; tint?: 'added' | null };

/** Height of a row in lines (fold scale and diff/duplicate rows included). Shared with the camera. */
export const rowLines = (ex: RowExtra | undefined) => (ex?.scale ?? 1) * (1 + (ex?.above?.length ?? 0) + (ex?.below?.length ?? 0));

function colorFor(kind: TokenKind, accent: string, COLORS: EditorColors): string {
  switch (kind) {
    case 'keyword':
      return accent;
    case 'boolean':
      return accent;
    case 'call':
      return COLORS.call;
    case 'string':
      return COLORS.string;
    case 'comment':
      return COLORS.comment;
    case 'number':
      return COLORS.number;
    case 'punct':
      return COLORS.punct;
    default:
      return COLORS.text;
  }
}

const Line: React.FC<{ C: EditorColors; text: string; accent: string; shadow: string; popAge?: number | null; marks?: LineMark[]; seedKey?: string; fontSize: number; pulse: number }> = ({ C, text, accent, shadow, popAge = null, marks = [], seedKey = '', fontSize, pulse }) => {
  const COLORS = C;
  const tokens = tokenize(text);
  const pop = popAge !== null && popAge >= 0 && popAge < 4 && text.length > 0;
  let consumed = 0;
  return (
    <>
      {tokens.map((t, i) => {
        const start = consumed;
        consumed += t.text.length;
        const holdsLast = pop && start + t.text.length === text.length;
        const style: React.CSSProperties = { color: colorFor(t.kind, accent, COLORS), textShadow: t.kind === 'space' ? undefined : shadow, fontWeight: t.kind === 'keyword' ? 700 : 400 };
        const mark = marks.find((m) => m.word === t.text);
        if (mark && (mark.kind === 'strike' || mark.kind === 'underline')) {
          style.textDecoration = mark.kind === 'strike' ? 'line-through' : 'underline';
          style.textDecorationColor = mark.kind === 'strike' ? accent : COLORS.call;
          style.textDecorationThickness = '0.09em';
          style.textUnderlineOffset = '0.14em';
          if (mark.kind === 'strike') style.color = COLORS.textDim;
        }
        if (mark && mark.kind === 'find') {
          style.background = 'rgba(255, 214, 64, 0.32)';
          style.boxShadow = '0 0 0 2px rgba(255, 214, 64, 0.8)';
          style.borderRadius = 4;
        }
        if (mark && mark.kind === 'found') {
          const k = Math.max(0, 1 - (mark.age ?? 99) / 18);
          style.background = `rgba(80, 255, 140, ${0.35 * k})`;
          style.color = k > 0.2 ? '#bfffd3' : style.color;
          style.borderRadius = 4;
        }
        if (mark && LETTER_FX.has(mark.kind as MarkKind) && (mark.age ?? -1) >= 0 && !holdsLast) {
          return <WordFx key={i} kind={mark.kind as MarkKind} text={t.text} age={mark.age ?? 0} base={style} accent={accent} fontSize={fontSize} seed={seedKey} pulse={pulse} />;
        }
        if (mark && mark.kind === 'shatter' && (mark.age ?? -1) >= 0) {
          // crack apart fast, drift, then pull back together
          const age = mark.age ?? 0;
          const a = age < 3 ? age / 3 : Math.exp(-(age - 3) / 14);
          return (
            <span key={i} style={{ ...style, color: a > 0.3 ? accent : style.color }}>
              {t.text.split('').map((ch, ci) => {
                const rx = random(`sh-${seedKey}-${t.text}-${ci}-x`) - 0.5;
                const ry = random(`sh-${seedKey}-${t.text}-${ci}-y`) - 0.5;
                const rr = random(`sh-${seedKey}-${t.text}-${ci}-r`) - 0.5;
                return (
                  <span key={ci} style={{ display: 'inline-block', transform: `translate(${(rx * 46 * a).toFixed(1)}px, ${(ry * 60 * a + a * 10).toFixed(1)}px) rotate(${(rr * 70 * a).toFixed(1)}deg)`, opacity: 1 - a * 0.35 }}>
                    {ch}
                  </span>
                );
              })}
            </span>
          );
        }
        if (!holdsLast) return <span key={i} style={style}>{t.text}</span>;
        const k = (popAge as number) / 4;
        const last = t.text.slice(-1);
        return (
          <span key={i} style={style}>
            {t.text.slice(0, -1)}
            <span style={{ display: 'inline-block', transform: `scale(${1.22 - 0.22 * k}) translateY(${-(1 - k) * 3}px)`, transformOrigin: '50% 80%', opacity: 0.55 + 0.45 * k, filter: `brightness(${1.6 - 0.6 * k})` }}>{last}</span>
          </span>
        );
      })}
    </>
  );
};

/** The HTML/CSS editor. Rendered oversized (EDITOR.width x EDITOR.height) and framed by the camera rig. */
export const CodeEditor: React.FC<CodeEditorProps> = ({
  filename,
  code,
  accent,
  typingLine = null,
  typedCount = 0,
  typingText = null,
  typoFrom = null,
  cursorLine = null,
  cursorOn,
  warning = null,
  autocomplete = null,
  aberration = 0,
  startLine = 1,
  chrome = true,
  fontSize = EDITOR.fontSize,
  opacity = 1,
  cursorColor,
  cursorLabel = null,
  extraCursors = [],
  sideNotes = {},
  lastCharAge = null,
  marks = {},
  ghost = null,
  pulse = 0,
  glow = 0,
  rowExtras = {},
  gutterFlash = 0,
}) => {
  const COLORS = useColors();
  const lineHeightPx = fontSize * EDITOR.lineHeight;
  // Text is drawn flat: no bloom, no RGB fringe. Kept as props so old storyboards still type-check.
  void aberration; void glow; void aberrationShadow;
  const shadow = 'none';
  const effectiveCursorLine = typingLine ?? cursorLine ?? code.length - 1;
  const charW = fontSize * 0.6;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: EDITOR.width,
        height: Math.max(EDITOR.height, EDITOR.codeTop + (code.length + 3) * lineHeightPx),
        background: 'transparent',
        fontFamily: FONT_FAMILY,
        fontSize,
        lineHeight: `${lineHeightPx}px`,
        color: COLORS.text,
        opacity,
        overflow: 'hidden',
      }}
    >
      {chrome ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: EDITOR.codeTop - EDITOR.tabBarHeight - 80,
            height: EDITOR.tabBarHeight,
            display: 'flex',
            alignItems: 'flex-end',
            paddingLeft: EDITOR.paddingLeft,
            fontSize: fontSize * 0.5,
            color: COLORS.textDim,
          }}
        >
          <div
            style={{
              padding: `${fontSize * 0.28}px ${fontSize * 0.6}px`,
              borderBottom: `${Math.max(3, fontSize * 0.06)}px solid ${accent}`,
              background: COLORS.bgPanel,
              color: COLORS.text,
              letterSpacing: '0.02em',
            }}
          >
            {filename}
          </div>
        </div>
      ) : null}

      <div style={{ position: 'absolute', left: 0, top: EDITOR.codeTop, right: 0 }}>
        {(() => {
          // Line numbers renumber when lines are duplicated; folded lines keep theirs, like a real editor.
          let num = startLine;
          const gutterStyle: React.CSSProperties = { width: EDITOR.gutterWidth, textAlign: 'right', paddingRight: fontSize * 0.7, color: gutterFlash > 0.02 ? COLORS.text : COLORS.gutter, opacity: gutterFlash > 0.02 ? 0.4 + 0.6 * gutterFlash : 1, fontSize: fontSize * 0.7, boxSizing: 'border-box', flex: 'none' };
          return code.map((raw, idx) => {
          const ex = rowExtras[idx];
          const scale = ex?.scale ?? 1;
          const myNum = num;
          num += 1 + (ex?.below?.length ?? 0);
          const row = renderRow(raw, idx, myNum);
          if (!ex) return row;
          const dupK = Math.max(0, 1 - (ex.belowAge ?? 99) / 20);
          return (
            <div key={idx} style={{ height: lineHeightPx * rowLines(ex), overflow: scale < 1 ? 'hidden' : undefined, opacity: scale < 1 ? scale : 1 }}>
              {(ex.above ?? []).map((t, k) => (
                <div key={`a${k}`} style={{ height: lineHeightPx, whiteSpace: 'pre', display: 'flex', background: 'rgba(229, 72, 77, 0.14)' }}>
                  <div style={{ ...gutterStyle, color: '#e5484d', opacity: 1 }}>−</div>
                  <div style={{ paddingLeft: EDITOR.paddingLeft, color: '#f2797c' }}>{t}</div>
                </div>
              ))}
              <div style={{ background: ex.tint === 'added' ? 'rgba(70, 190, 110, 0.14)' : undefined }}>{row}</div>
              {(ex.below ?? []).map((t, k) => (
                <div key={`b${k}`} style={{ position: 'relative', height: lineHeightPx, whiteSpace: 'pre', display: 'flex', background: `rgba(255, 255, 255, ${(0.07 * dupK).toFixed(3)})` }}>
                  <div style={gutterStyle}>{myNum + k + 1}</div>
                  <div style={{ position: 'relative', paddingLeft: EDITOR.paddingLeft }}>
                    <Line C={COLORS} text={t} accent={accent} shadow={shadow} fontSize={fontSize} pulse={pulse} />
                  </div>
                </div>
              ))}
            </div>
          );
          });
          function renderRow(raw: string, idx: number, lineNo: number) {
          const isTyping = typingLine === idx;
          const text = isTyping ? (typingText ?? raw.slice(0, Math.max(0, typedCount))) : raw;
          const typo = isTyping && typoFrom !== null && typoFrom < text.length ? typoFrom : null;
          const showCursor = effectiveCursorLine === idx;
          const hasWarning = warning && warning.line === idx;
          const hasPopup = autocomplete && autocomplete.line === idx;
          return (
            <div key={idx} style={{ position: 'relative', height: lineHeightPx, whiteSpace: 'pre', display: 'flex' }}>
              <div style={{ ...gutterStyle, color: rowExtras[idx]?.tint === 'added' ? '#58c27d' : gutterStyle.color }}>
                {lineNo}
              </div>
              <div style={{ position: 'relative', paddingLeft: EDITOR.paddingLeft }}>
                <Line C={COLORS} text={text} accent={accent} shadow={shadow} popAge={isTyping ? lastCharAge : null} marks={marks[idx] ?? []} seedKey={String(idx)} fontSize={fontSize} pulse={pulse} />
                {showCursor ? <Cursor color={cursorColor ?? accent} on={cursorOn} label={cursorLabel} kick={isTyping && lastCharAge !== null && lastCharAge >= 0 && lastCharAge < 3 ? 1 - lastCharAge / 3 : 0}/> : null}
                {isTyping && ghost ? <span style={{ color: COLORS.textDim, opacity: 0.45, fontStyle: 'italic', marginLeft: fontSize * 0.08 }}>{ghost}</span> : null}
                {typo !== null ? (
                  <svg style={{ position: 'absolute', left: EDITOR.paddingLeft + typo * charW, top: lineHeightPx * 0.8, pointerEvents: 'none' }} width={charW * (text.length - typo)} height={fontSize * 0.2}>
                    <path
                      d={Array.from({ length: Math.ceil((charW * (text.length - typo)) / (fontSize * 0.14)) + 1 }, (_, i) => `${i === 0 ? 'M' : 'L'} ${(i * fontSize * 0.14).toFixed(1)} ${i % 2 === 0 ? fontSize * 0.04 : fontSize * 0.15}`).join(' ')}
                      stroke="#e5484d"
                      strokeWidth={Math.max(2, fontSize * 0.035)}
                      fill="none"
                    />
                  </svg>
                ) : null}
                {extraCursors.filter((c) => c.line === idx).map((c, k) => (
                  <Cursor key={k} color={c.color} on={c.on} label={c.label} />
                ))}
                {sideNotes[idx] ? <span style={{ marginLeft: fontSize * 0.6, fontSize: fontSize * 0.5, color: COLORS.comment }}>{sideNotes[idx]}</span> : null}
                {hasWarning ? (
                  <>
                    <svg
                      style={{ position: 'absolute', left: EDITOR.paddingLeft, top: lineHeightPx * 0.78, pointerEvents: 'none' }}
                      width={charW * Math.max(4, text.length)}
                      height={fontSize * 0.25}
                      viewBox={`0 0 ${charW * Math.max(4, text.length)} ${fontSize * 0.25}`}
                    >
                      <path
                        d={Array.from({ length: Math.ceil((charW * Math.max(4, text.length)) / (fontSize * 0.2)) }, (_, i) => {
                          const x = i * fontSize * 0.2;
                          return `${i === 0 ? 'M' : 'L'} ${x} ${i % 2 === 0 ? fontSize * 0.05 : fontSize * 0.2}`;
                        }).join(' ')}
                        stroke={accent}
                        strokeWidth={Math.max(2, fontSize * 0.045)}
                        fill="none"
                        opacity={0.9}
                      />
                    </svg>
                    <div
                      style={{
                        position: 'absolute',
                        left: EDITOR.paddingLeft,
                        top: -lineHeightPx * 0.95,
                        fontSize: fontSize * 0.5,
                        lineHeight: 1.1,
                        padding: `${fontSize * 0.18}px ${fontSize * 0.35}px`,
                        background: COLORS.warningBg,
                        border: `${Math.max(2, fontSize * 0.03)}px solid ${withAlpha(COLORS.warningBorder, 0.85)}`,
                        color: COLORS.warningText,
                        borderRadius: fontSize * 0.1,
                        whiteSpace: 'nowrap',
                        boxShadow: `0 ${fontSize * 0.2}px ${fontSize * 0.6}px rgba(0,0,0,0.6)`,
                      }}
                    >
                      <span style={{ marginRight: fontSize * 0.2 }}>&#9650;</span>
                      {warning.text}
                    </div>
                  </>
                ) : null}
                {hasPopup ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: EDITOR.paddingLeft + charW * Math.max(2, text.length - 2),
                      top: lineHeightPx * 1.05,
                      minWidth: charW * 14,
                      background: COLORS.popupBg,
                      border: `${Math.max(2, fontSize * 0.03)}px solid ${COLORS.popupBorder}`,
                      borderRadius: fontSize * 0.12,
                      padding: `${fontSize * 0.15}px 0`,
                      fontSize: fontSize * 0.62,
                      lineHeight: `${fontSize * 1.05}px`,
                      boxShadow: `0 ${fontSize * 0.3}px ${fontSize * 0.9}px rgba(0,0,0,0.7)`,
                    }}
                  >
                    {autocomplete.items.map((item, i) => (
                      <div key={i} style={{ padding: `0 ${fontSize * 0.4}px`, color: i === 0 ? COLORS.text : COLORS.textDim, background: i === 0 ? withAlpha('#ffffff', 0.05) : 'transparent' }}>
                        <span style={{ color: COLORS.call, marginRight: fontSize * 0.3 }}>&#402;</span>
                        {item}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
          }
        })()}
      </div>
    </div>
  );
};
