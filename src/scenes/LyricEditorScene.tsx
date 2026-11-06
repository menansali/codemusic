import React from 'react';
import { Easing, interpolate } from 'remotion';
import { CameraRig, type CameraState } from '../effects/CameraRig';
import { BlurLayer } from '../effects/DepthOfField';
import { cursorOn } from '../effects/CursorBlink';
import { CodeEditor, rowLines, type LineMark, type RowExtra } from '../editor/CodeEditor';
import { tokenize } from '../editor/highlight';
import { EDITOR, FONT_FAMILY, useColors, withAlpha } from '../editor/theme';
import { TwistOverlay, TWIST_T } from '../composition/TwistOverlay';
import { ChatView, type ChatMessage } from './ChatView';
import { VIBES } from '../lib/vibes';
import { cuesForLine, fold } from '../lyrics/lexicon';
import { YinYangSplit } from '../effects/YinYangSplit';
import { Beetle } from '../composition/Beetle';
import type { PropKind } from '../lyrics/lexicon';
import { charFrame, doneFrame, keyFrames, stretchExtras, typedCount, typedText, twistDelayFrames, type LyricPlan } from '../schema/timeline';
import { rng } from '../lib/seed';
import type { SceneProps } from './types';
import { editorCamera, sway, useSceneClock } from './shared';

const whipEase = Easing.bezier(0.2, 0.9, 0.25, 1);
const WHIP_FRAMES = 7;
/** How long the find bar stays open (the camera pulls back for it). */
const FIND_FRAMES = 46;

/**
 * Lyrics typed as code by named cursors. The camera rides the line being typed and whips
 * (motion-blurred) to the next line when it starts, like a live collaborative editor filmed macro.
 */
export const LyricEditorScene: React.FC<SceneProps<'lyricEditor'>> = ({ scene, storyboard, timing }) => {
  const { frame, fps, width, height, progress, t } = useSceneClock(timing);
  const C = useColors();
  const vibe = VIBES[storyboard.vibe ?? 'gece'];
  const accent = storyboard.palette.accent;
  const colors = [vibe.cursorColors[0] === '#ff2a2a' ? accent : vibe.cursorColors[0], vibe.cursorColors[1]];
  if (vibe.surface === 'chat') return <ChatSurface scene={scene} storyboard={storyboard} timing={timing} />;
  if (scene.split && !scene.reveal && scene.names.length > 1) return <SplitSurface scene={scene} storyboard={storyboard} timing={timing} />;
  const plans = timing.lyrics;
  const lineH = EDITOR.fontSize * EDITOR.lineHeight;
  const charW = EDITOR.fontSize * 0.6;

  // Which live line is active (last one that has started)?
  let active = -1;
  for (let i = 0; i < plans.length; i++) if (frame >= plans[i]!.startFrame) active = i;

  const code: string[] = [...scene.before];
  const sideNotes: Record<number, string> = {};
  const marks: Record<number, LineMark[]> = {};
  const firedProps: { kind: PropKind; age: number; lineIdx: number }[] = [];
  scene.lines.forEach((l, i) => {
    const full = i < active ? l.text : i === active ? l.text : '';
    code.push(full);
    const plan = plans[i];
    if (l.comment && plan && typedCount(plan, frame) >= l.text.length) sideNotes[scene.before.length + i] = `// ${l.comment}`;
    if (plan) {
      const n = typedCount(plan, frame);
      for (const c of l.cues) {
        if (n < c.char) continue;
        const fireFrame = charFrame(plan, c.char);
        if (c.mark) (marks[scene.before.length + i] ??= []).push({ word: c.word, kind: c.mark, age: frame - fireFrame });
        if (c.prop) firedProps.push({ kind: c.prop, age: frame - fireFrame, lineIdx: scene.before.length + i });
      }
    }
  });
  // Words typed in earlier scenes keep their marks.
  scene.before.forEach((text, idx) => {
    for (const c of cuesForLine(text)) if (c.mark) (marks[idx] ??= []).push({ word: c.word, kind: c.mark, age: 400 + idx * 7 });
  });
  if (code.length === 0) code.push('');

  // Extra rows: a rewritten line shows its old version above (removed diff); the loop signature duplicates a line below.
  const rowExtras: Record<number, RowExtra> = {};
  const B = scene.before.length;
  scene.lines.forEach((l, i) => {
    const plan = plans[i];
    if (!plan || frame < plan.startFrame) return;
    if (l.diff) rowExtras[B + i] = { above: [l.diff], tint: 'added' };
    if (l.sig?.kind === 'loop') {
      const done = doneFrame(plan);
      if (frame >= done + 2) {
        const k = Math.min(3, Math.floor((frame - done - 2) / 4) + 1);
        rowExtras[B + i] = { ...(rowExtras[B + i] ?? {}), below: Array.from({ length: k }, () => l.text), belowAge: frame - done - 2 - (k - 1) * 4 };
      }
    }
  });
  // Reveal: verses fold into one line each.
  const foldK = scene.reveal && scene.folds?.length ? interpolate(frame, [Math.round(fps * 0.35), Math.round(fps * 0.35) + 9], [0, 1], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
  const codeFull = [...code];
  if (foldK > 0) {
    for (const f of scene.folds ?? []) {
      if (foldK >= 0.5) code[f.from] = f.label;
      for (let j = f.from + 1; j < f.to && j < code.length; j++) rowExtras[j] = { ...(rowExtras[j] ?? {}), scale: 1 - foldK };
    }
  }
  const rowsBefore = (idx: number) => {
    let n = 0;
    for (let j = 0; j < idx; j++) n += rowLines(rowExtras[j]);
    return n;
  };
  /** Content y of the middle of a line's own text (below any removed-diff row). */
  const textY = (idx: number) => EDITOR.codeTop + (rowsBefore(idx) + (rowExtras[idx]?.above?.length ?? 0) * (rowExtras[idx]?.scale ?? 1) + 0.5) * lineH;
  const totalRows = rowsBefore(code.length);

  const activePlan = active >= 0 ? plans[active]! : null;
  const typed = activePlan ? typedCount(activePlan, frame) : 0;
  // What is actually on the line, typos included; the wrong part gets a spellcheck squiggle.
  const shown = activePlan ? typedText(activePlan, frame) : '';
  // Held-note letters are part of the line, not a typo.
  const extras = activePlan ? stretchExtras(activePlan, frame) : 0;
  const typoFrom = shown.length - extras > typed ? typed : null;
  const keys = activePlan ? keyFrames(activePlan).filter((k) => k <= frame) : [];
  const lastCharAge = keys.length > 0 ? frame - keys[keys.length - 1]! : null;
  const typingNow = activePlan !== null && typed > 0 && frame <= doneFrame(activePlan);
  // The suggestion disappears while the typist is off track, like a real autocomplete.
  const ghost = activePlan && activePlan.fx === 'predict' && typingNow && typoFrom === null ? activePlan.text.slice(typed) : null;

  // Search: once the chorus word is typed again, the find bar opens and every match in the file lights up.
  let find: { word: string; age: number; count: number } | null = null;
  scene.lines.forEach((l, i) => {
    const plan = plans[i];
    if (!l.find || !plan) return;
    const age = frame - charFrame(plan, l.find.char);
    if (age < 0 || age >= FIND_FRAMES) return;
    let count = 0;
    code.forEach((line, idx) => {
      const text = idx === B + active ? shown : line;
      for (const t of tokenize(text)) if (t.text === l.find!.word) count++;
      if (text.includes(l.find!.word)) (marks[idx] ??= []).push({ word: l.find!.word, kind: 'find' });
    });
    find = { word: l.find.word, age, count };
  });
  const findF = find as { word: string; age: number; count: number } | null;
  const findK = findF ? interpolate(findF.age, [0, 8, FIND_FRAMES - 10, FIND_FRAMES], [0, 1, 1, 0], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;

  // Signature effect (mirror / retro / light) from the moment its word is typed.
  let sig: { kind: string; age: number } | null = null;
  scene.lines.forEach((l, i) => {
    const plan = plans[i];
    if (!l.sig || !plan || l.sig.kind === 'loop' || l.sig.kind === 'yinyang') return;
    const age = frame - charFrame(plan, l.sig.char);
    if (age >= 0) sig = { kind: l.sig.kind, age };
  });
  const sigF = sig as { kind: string; age: number } | null;
  const mirrorK = sigF?.kind === 'mirror' ? interpolate(sigF.age, [0, 9, 9 + Math.round(fps * 1.3), 18 + Math.round(fps * 1.3)], [0, 1, 1, 0], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
  const retroOn = sigF?.kind === 'retro' && sigF.age >= 2;
  // (light mode is applied to the whole frame by the Reel, so the vignette and grain follow it)

  // Snares: the line numbers flicker.
  const absF = timing.from + frame;
  let lastSnare = -1e9;
  for (const k of storyboard.snares ?? []) {
    if (k > absF) break;
    lastSnare = k;
  }
  const gutterFlash = absF - lastSnare < 12 ? Math.exp(-(absF - lastSnare) / 3) : 0;

  // Music-driven signals in reel frames.
  const abs = timing.from + frame;
  const kicks = storyboard.kicks ?? [];
  let lastKick = -1e9;
  for (const k of kicks) {
    if (k > abs) break;
    lastKick = k;
  }
  const kickAge = abs - lastKick;
  const beat = storyboard.audio.beatSec ?? null;
  const beatAge = beat ? ((((abs - (storyboard.audio.beatOffset ?? 0) * fps) % (beat * fps)) + beat * fps) % (beat * fps)) : 1e9;
  const pulseAge = kicks.length ? kickAge : beatAge;
  const pulse = Math.exp(-pulseAge / 4);
  // Snap zoom on the hook word: the moment a chorus line lands, punch in and settle.
  let landAge = 1e9;
  scene.lines.forEach((l, i) => {
    const plan = plans[i];
    if (!plan || l.fx !== 'predict') return;
    const a = frame - doneFrame(plan);
    if (a >= 0 && a < landAge) landAge = a;
  });
  const landPunch = landAge < 24 ? Math.exp(-landAge / 5) : 0;

  // Reveal twists that edit the file itself.
  const tw = scene.reveal ? scene.twist ?? null : null;
  const tf = (sec: number) => Math.round(sec * fps);
  // When the reveal first types the line the song is on, the twist waits until that line is finished.
  const lastPlan = scene.reveal && tw && tw.kind !== 'join' && plans.length > 0 ? plans[plans.length - 1]! : null;
  const twistDelay = twistDelayFrames(scene, plans, fps, TWIST_T.press);
  const tframe = frame - twistDelay;
  if (tw && tw.kind === 'replace' && tw.from && tw.to) {
    const esc = tw.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\p{L}])${esc}(?![\\p{L}])`, 'gu');
    for (let idx = 0; idx < code.length; idx++) {
      if (!re.test(code[idx]!)) continue;
      re.lastIndex = 0;
      if (tframe >= tf(TWIST_T.swap)) {
        code[idx] = code[idx]!.replace(re, tw.to);
        (marks[idx] ??= []).push({ word: tw.to, kind: 'found', age: tframe - tf(TWIST_T.swap) });
      } else if (tframe >= tf(TWIST_T.find)) {
        (marks[idx] ??= []).push({ word: tw.from, kind: 'find' });
      }
    }
  }
  // "yin ... yang": the moment "yang" is typed the frame splits into the two halves. A twist that
  // breaks the file (the error) takes the light half away again.
  let yyOn: number | null = null;
  const yyAllowed = !storyboard.signature || storyboard.signature === 'yinyang';
  scene.lines.forEach((l, i) => {
    const plan = plans[i];
    const k = fold(l.text).indexOf('yang');
    if (!yyAllowed || !plan || k < 0 || !fold(l.text).includes('yin') || yyOn !== null) return;
    yyOn = charFrame(plan, k + 4);
  });
  const yyOff = tw && tw.kind === 'error' ? tf(TWIST_T.press) + twistDelay : Number.POSITIVE_INFINITY;
  const yyAge = yyOn !== null && frame < yyOff ? frame - yyOn : -1;
  const consoleOpen = tw && (tw.kind === 'run' || tw.kind === 'git' || tw.kind === 'error') && tframe >= tf(TWIST_T.open);
  const errorHit = tw && tw.kind === 'error' ? Math.max(0, 1 - Math.abs(tframe - tf(TWIST_T.press)) / 8) : 0;
  const activeLineIdx = active >= 0 ? scene.before.length + active : Math.max(0, code.length - 1);
  const speaker = activePlan ? activePlan.speaker : 0;
  const name = scene.names[Math.min(speaker, scene.names.length - 1)] ?? null;

  // Idle cursor of the other collaborator, parked at the end of their last finished line.
  const extra: { line: number; color: string; label: string | null; on: boolean }[] = [];
  if (scene.names.length > 1) {
    const other = speaker === 0 ? 1 : 0;
    let last = -1;
    for (let i = 0; i < active; i++) if (plans[i]!.speaker === other) last = i;
    if (last >= 0) extra.push({ line: scene.before.length + last, color: colors[other]!, label: scene.names[other] ?? null, on: cursorOn(frame, fps, false, 9) });
    // In the reveal, whoever wrote the file so far stays parked at the end of it while the other one types.
    else if (scene.reveal && active >= 0 && scene.before.length > 0) extra.push({ line: scene.before.length - 1, color: colors[other]!, label: scene.names[other] ?? null, on: cursorOn(frame, fps, false, 9) });
  }

  // Camera: every shot is fitted so the full line (gutter included) stays inside the frame.
  // Short lines get extreme macro, long lines pull back just enough. Tilt costs a little width.
  const MARGIN = 1.07 + Math.abs(scene.camera.tiltDeg) * 0.004;
  const TEXT_X = EDITOR.gutterWidth + EDITOR.paddingLeft;
  // +3.4 chars on the right leaves room for the cursor block and its name tag.
  const lineW = (text: string) => (Math.max(8, text.length) + 3.4) * charW;
  const fitZoom = (w: number, maxZoom: number) => Math.max(1.05, Math.min(maxZoom, EDITOR.width / (w * MARGIN)));
  const lineCenterX = (text: string) => TEXT_X - charW * 0.6 + lineW(text) / 2;
  // Room for held-note letters and the removed-diff row, so nothing is clipped mid-line.
  const fitText = (idx: number) => {
    const i = idx - B;
    const plan = i >= 0 ? plans[i] : undefined;
    const t = code[idx] ?? '';
    const diff = i >= 0 ? scene.lines[i]?.diff ?? '' : '';
    const padded = plan?.stretch ? t + 'x'.repeat(plan.stretch.n) : t;
    return diff.length > padded.length ? diff : padded;
  };
  let state: CameraState;
  let whipBlur = 0;
  let zoomBlur = 0;
  if (scene.reveal) {
    const base = editorCamera(scene.camera, progress);
    // While verses fold, the framing eases from the full file to the folded one.
    const longestOf = (lines: string[]) => lines.reduce((m, l) => Math.max(m, l.length), 0);
    const visible = code.filter((_, j) => (rowExtras[j]?.scale ?? 1) > 0.5);
    const longest = longestOf(codeFull) + (longestOf(visible) - longestOf(codeFull)) * foldK;
    const w = lineW('x'.repeat(Math.round(longest)));
    const rows = totalRows + 1.5;
    const zH = (EDITOR.width * (height / width)) / (rows * lineH * 1.12);
    const z = Math.min(fitZoom(w + EDITOR.gutterWidth, 2.2), zH);
    const breathe = 1 + 0.03 * progress;
    state = { ...base, zoom: z * breathe, px: TEXT_X - EDITOR.gutterWidth / 2 + w / 2 - charW, py: EDITOR.codeTop + (totalRows * lineH) / 2 - lineH * 0.2 };
    // Join twist, or a lyric line typed before the twist: once typing starts, the camera leaves the wide shot and pushes in on the line.
    if (tw && (tw.kind === 'join' || lastPlan) && activePlan) {
      const k = interpolate(frame - activePlan.startFrame, [0, Math.round(fps * 1.1)], [0, 1], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const lineText = activePlan.text;
      const zIn = fitZoom(lineW(lineText), 2.1);
      const pyIn = textY(activeLineIdx) - lineH * 1.2;
      state = { ...state, zoom: state.zoom + (zIn - state.zoom) * k, px: state.px + (lineCenterX(lineText) - state.px) * k, py: state.py + (pyIn - state.py) * k };
    }
  } else {
    const base = editorCamera(scene.camera, progress);
    const lineY = textY;
    const textAt = fitText;
    const prevIdx = active > 0 ? scene.before.length + active - 1 : activeLineIdx;
    const since = activePlan ? frame - activePlan.startFrame : WHIP_FRAMES;
    const k = interpolate(since, [0, WHIP_FRAMES], [0, 1], { easing: whipEase, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const kPrev = interpolate(since - 1, [0, WHIP_FRAMES], [0, 1], { easing: whipEase, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const maxZoom = 3.1;
    const fromIdx = active > 0 ? prevIdx : activeLineIdx;
    const zFrom = fitZoom(lineW(textAt(fromIdx)), maxZoom);
    const zTo = fitZoom(lineW(textAt(activeLineIdx)), maxZoom);
    const fromY = lineY(fromIdx);
    const toY = lineY(activeLineIdx);
    const py = fromY + (toY - fromY) * k;
    const px = lineCenterX(textAt(fromIdx)) + (lineCenterX(textAt(activeLineIdx)) - lineCenterX(textAt(fromIdx))) * k;
    const zoom = (zFrom + (zTo - zFrom) * k) * (1 + 0.03 * (1 - k)) * (1 + 0.025 * progress);
    const scaleOnScreen = (width / EDITOR.width) * zoom;
    whipBlur = Math.min(26, Math.abs((k - kPrev) * (toY - fromY)) * scaleOnScreen * 0.55);
    state = { ...base, px, py, zoom };
    // Find: pull back to show the last dozen lines and every match, then return.
    if (findK > 0) {
      const from = Math.max(0, activeLineIdx - 11);
      const win = code.slice(from, activeLineIdx + 1);
      const wW = lineW('x'.repeat(win.reduce((m, l) => Math.max(m, l.length), 0)));
      const y0 = textY(from) - lineH * 0.5;
      const y1 = textY(activeLineIdx) + lineH * 0.5;
      const zW = fitZoom(wW, 2.2);
      const zH = (EDITOR.width * (height / width)) / ((y1 - y0) * 1.5);
      const wide = { zoom: Math.min(zW, zH), px: TEXT_X - EDITOR.gutterWidth / 2 + wW / 2 - charW, py: (y0 + y1) / 2 };
      state = { ...state, zoom: state.zoom + (wide.zoom - state.zoom) * findK, px: state.px + (wide.px - state.px) * findK, py: state.py + (wide.py - state.py) * findK };
      whipBlur *= 1 - findK;
    }
  }
  state = { ...state, tilt: state.tilt * vibe.tilt, zoom: state.zoom * (1 + 0.16 * landPunch) };

  // Smash pull-out hook: scene 1 opens inside the word being typed, then snaps back on the first beat after ~0.7 s.
  if (timing.index === 0 && storyboard.hook?.style === 'macro' && !scene.reveal) {
    const beat = storyboard.audio.beatSec ?? 0.5;
    const off = storyboard.audio.beatOffset ?? 0;
    const hit = Math.round((off + Math.max(0, Math.ceil((0.7 - off) / beat)) * beat) * fps);
    const k = interpolate(frame, [hit - 2, hit + 7], [0, 1], { easing: Easing.bezier(0.7, 0, 0.2, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const kPrev = interpolate(frame - 1, [hit - 2, hit + 7], [0, 1], { easing: Easing.bezier(0.7, 0, 0.2, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const cursorX = EDITOR.gutterWidth + EDITOR.paddingLeft + Math.max(0, shown.length - 2.5) * charW;
    const macro = 3.4 + 0.25 * Math.min(1, frame / Math.max(1, hit));
    state = { ...state, zoom: state.zoom * (macro + (1 - macro) * k), px: cursorX + (state.px - cursorX) * k, tilt: state.tilt * (1.8 - 0.8 * k) };
    zoomBlur = Math.abs(k - kPrev) * 60;
  }
  const heroOn = (storyboard.hero ?? 'none') !== 'none' && !scene.reveal;
  const sw = sway(t, storyboard.seed + timing.index, scene.reveal ? 0.4 : 1);
  // With a hero piece on top, the typing line sits lower in the frame.
  const shake = errorHit > 0 ? Math.sin(frame * 2.7) * 26 * errorHit : 0;
  const s = { x: sw.x + shake, y: sw.y + (heroOn ? height * 0.12 : 0) + (consoleOpen ? -height * 0.17 : 0) };
  // Rack focus in during the first half second of every macro shot.
  const focusIn = scene.reveal || (timing.index === 0 && storyboard.hook?.style === 'macro') ? 0 : interpolate(frame, [0, Math.round(fps * 0.45)], [9, 0], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Props
  const r = rng(storyboard.seed, `lyric-prop-${timing.index}`);
  const wob = r();
  const p = interpolate(progress, [0, 1], [0, 1], { easing: Easing.inOut(Easing.quad) });
  const beetleX = -240 + p * (width + 480);
  const beetleY = height * (0.12 + wob * 0.12) + p * height * 0.5 + Math.sin(p * Math.PI * 2.5) * 70;

  const far = { ...state, zoom: state.zoom * 0.6, px: state.px * 0.9 + 320, py: state.py * 0.92 + 380, tilt: state.tilt * 0.8 };

  return (
    <>
      {!scene.reveal ? (
        <BlurLayer blurPx={12} opacity={0.35}>
          <CameraRig state={far} contentWidth={EDITOR.width} contentHeight={EDITOR.height} viewportWidth={width} viewportHeight={height}>
            <CodeEditor filename="" code={code} accent={accent} cursorOn={false} chrome={false} opacity={0.85} startLine={11} />
          </CameraRig>
        </BlurLayer>
      ) : null}
      {whipBlur > 0.4 ? (
        <svg width={0} height={0} style={{ position: 'absolute' }}>
          <filter id={`vblur-${timing.index}`} x="-5%" y="-20%" width="110%" height="140%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={`0 ${(Math.min(12, whipBlur * 0.5)).toFixed(2)}`} />
          </filter>
        </svg>
      ) : null}
      <div style={{ position: 'absolute', inset: 0, opacity: consoleOpen ? 0.5 : 1, transform: mirrorK > 0 ? `perspective(2400px) rotateY(${(180 * mirrorK).toFixed(2)}deg)` : undefined, filter: [whipBlur > 0.4 ? `url(#vblur-${timing.index})` : '', zoomBlur + focusIn > 0.4 ? `blur(${Math.min(28, zoomBlur + focusIn).toFixed(1)}px)` : '', retroOn ? 'grayscale(1) sepia(1) hue-rotate(58deg) saturate(2.6) contrast(1.15) brightness(0.92)' : ''].filter(Boolean).join(' ') || undefined }}>
        {retroOn ? <div style={{ position: 'absolute', inset: 0, background: C.bg }} /> : null}
        <CameraRig state={state} contentWidth={EDITOR.width} contentHeight={EDITOR.height} viewportWidth={width} viewportHeight={height} sway={{ x: s.x, y: s.y }}>
          <CodeEditor
            filename={scene.filename}
            code={code}
            accent={accent}
            typingLine={activePlan ? activeLineIdx : null}
            typedCount={typed}
            typingText={activePlan ? shown : null}
            typoFrom={typoFrom}
            cursorLine={activeLineIdx}
            cursorOn={cursorOn(frame, fps, typingNow)}
            cursorColor={colors[speaker]}
            cursorLabel={name}
            extraCursors={extra}
            sideNotes={sideNotes}
            lastCharAge={lastCharAge}
            marks={marks}
            ghost={ghost}
            pulse={pulse}
            rowExtras={rowExtras}
            gutterFlash={gutterFlash}
            warning={tw && tw.kind === 'error' && tframe >= tf(TWIST_T.press) ? { line: Math.max(0, code.length - 1), text: 'error' } : null}
            chrome={scene.reveal || scene.before.length < 3}
          />
        </CameraRig>
      </div>
      {retroOn ? <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 6px)', pointerEvents: 'none' }} /> : null}
      {findF ? <FindBar word={findF.word} count={findF.count} k={findK} width={width} height={height} accent={accent} /> : null}
      <YinYangSplit age={yyAge} width={width} height={height} />
      {scene.prop === 'beetle' ? <Beetle x={beetleX} y={beetleY} size={420 + wob * 80} heading={140 + Math.cos(p * Math.PI * 2.5) * 8} walkPhase={t * 9} /> : null}
      {tw ? <TwistOverlay twist={tw} frame={tframe} fps={fps} width={width} height={height} accent={accent} filename={scene.filename} lastLine={code.length} joinName={scene.names[1] ?? null} joinColor={colors[1]} trace={codeFull} endFrame={timing.durationInFrames - Math.round(fps * 1.1) - twistDelay} /> : null}
      {/* Word meaning is carried by the letters themselves (WordFx); floating clip-art props stay off. */}
      <SceneNotes notes={scene.notes} frame={frame} fps={fps} width={width} height={height} top={heroOn ? 0.72 : 0.62} />
    </>
  );
};

/** Story notes: small tags that slide in beside the code, like annotations in a shared doc. */
const SceneNotes: React.FC<{ notes: { text: string; at: number }[]; frame: number; fps: number; width: number; height: number; top: number }> = ({ notes, frame, fps, width, height, top }) => {
  const C = useColors();
  return (
    <>
      {notes.map((n, i) => {
        const f0 = Math.round(n.at * fps);
        const k = interpolate(frame, [f0, f0 + 10], [0, 1], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        if (k <= 0) return null;
        return (
          <div key={i} style={{ position: 'absolute', left: width * 0.1 + (1 - k) * 60, top: height * (top + i * 0.065), opacity: k, fontFamily: FONT_FAMILY, fontSize: 32, color: C.comment, background: withAlpha(C.bg, 0.92), borderRadius: 8, padding: '12px 20px', whiteSpace: 'nowrap' }}>
            {`// ${n.text.replace(/\.$/, '')}`}
          </div>
        );
      })}
    </>
  );
};

/** The editor's own find widget: the searched word and how many times it is in the file. */
const FindBar: React.FC<{ word: string; count: number; k: number; width: number; height: number; accent: string }> = ({ word, count, k, width, height }) => {
  const C = useColors();
  return (
    <div style={{ position: 'absolute', right: width * 0.06, top: height * 0.06 - (1 - k) * 40, opacity: k, display: 'flex', alignItems: 'center', gap: 18, padding: '16px 22px', borderRadius: 12, background: withAlpha(C.bg, 0.96), border: `2px solid ${withAlpha(C.text, 0.1)}`, fontFamily: FONT_FAMILY, boxShadow: '0 16px 48px rgba(0,0,0,0.45)' }}>
      <span style={{ fontSize: 26, color: C.textDim }}>Bul</span>
      <span style={{ fontSize: 34, color: C.text, padding: '6px 14px', borderRadius: 8, border: '2px solid rgba(255, 214, 64, 0.8)', minWidth: 120 }}>{word}</span>
      <span style={{ fontSize: 28, color: C.textDim, fontVariantNumeric: 'tabular-nums' }}>{`${count} eşleşme`}</span>
    </div>
  );
};

/** Duet: two panes, one file per singer. The pane whose singer is on gets the light; each camera rides its own line. */
const SplitSurface: React.FC<SceneProps<'lyricEditor'>> = ({ scene, storyboard, timing }) => {
  const { frame, fps, width, height } = useSceneClock(timing);
  const C = useColors();
  const vibe = VIBES[storyboard.vibe ?? 'gece'];
  const accent = storyboard.palette.accent;
  const colors = [vibe.cursorColors[0] === '#ff2a2a' ? accent : vibe.cursorColors[0], vibe.cursorColors[1]];
  const plans = timing.lyrics;
  const lineH = EDITOR.fontSize * EDITOR.lineHeight;
  const charW = EDITOR.fontSize * 0.6;
  const TEXT_X = EDITOR.gutterWidth + EDITOR.paddingLeft;
  const paneH = height / 2;
  let active = -1;
  for (let i = 0; i < plans.length; i++) if (frame >= plans[i]!.startFrame) active = i;
  const speakerNow = active >= 0 ? plans[active]!.speaker : (scene.lines[0]?.speaker ?? 0);
  const heroOn = (storyboard.hero ?? 'none') !== 'none';
  return (
    <>
      {[0, 1].map((sp) => {
        const started = scene.lines.map((l, i) => (l.speaker === sp && i <= active ? i : -1)).filter((i) => i >= 0);
        const code = started.length ? started.map((i) => scene.lines[i]!.text) : [''];
        const cur = started.length ? started[started.length - 1]! : null;
        const plan = cur !== null ? plans[cur]! : null;
        const typingHere = plan !== null && cur === active;
        const shown = typingHere ? typedText(plan, frame) : null;
        const typed = typingHere ? typedCount(plan, frame) : 0;
        const extras = typingHere ? stretchExtras(plan, frame) : 0;
        const keys = typingHere ? keyFrames(plan!).filter((f) => f <= frame) : [];
        const row = code.length - 1;
        const pad = plan?.stretch?.n ?? 0;
        const lineW = (txt: string, p = 0) => (Math.max(8, txt.length + p) + 3.4) * charW;
        const fit = (w: number) => Math.max(1.05, Math.min(2.6, EDITOR.width / (w * 1.08)));
        const cx = (txt: string, p = 0) => TEXT_X - charW * 0.6 + lineW(txt, p) / 2;
        const y = (r: number) => EDITOR.codeTop + (r + 0.5) * lineH;
        const k = interpolate(plan ? frame - plan.startFrame : WHIP_FRAMES, [0, WHIP_FRAMES], [0, 1], { easing: whipEase, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const prev = Math.max(0, row - 1);
        const zTo = fit(lineW(code[row]!, pad));
        const zFrom = row > 0 ? fit(lineW(code[prev]!)) : zTo;
        const state = {
          zoom: zFrom + (zTo - zFrom) * k,
          px: row > 0 ? cx(code[prev]!) + (cx(code[row]!, pad) - cx(code[prev]!)) * k : cx(code[row]!, pad),
          py: row > 0 ? y(prev) + (y(row) - y(prev)) * k : y(row),
          tilt: scene.camera.tiltDeg * 0.4 * vibe.tilt * (sp === 0 ? 1 : -1),
          focus: 1,
        };
        return (
          <div key={sp} style={{ position: 'absolute', left: 0, top: sp * paneH, width, height: paneH, overflow: 'hidden', opacity: sp === speakerNow ? 1 : 0.45 }}>
            <CameraRig state={state} contentWidth={EDITOR.width} contentHeight={EDITOR.height} viewportWidth={width} viewportHeight={paneH}>
              <CodeEditor
                filename=""
                code={code}
                accent={accent}
                typingLine={typingHere ? row : null}
                typedCount={typed}
                typingText={shown}
                typoFrom={shown !== null && shown.length - extras > typed ? typed : null}
                cursorLine={row}
                cursorOn={cursorOn(frame, fps, typingHere && frame <= doneFrame(plan!))}
                cursorColor={colors[sp]}
                cursorLabel={scene.names[sp] ?? null}
                lastCharAge={keys.length ? frame - keys[keys.length - 1]! : null}
                chrome={false}
              />
            </CameraRig>
            <div style={{ position: 'absolute', left: 56, top: sp === 0 ? 210 : 40, fontFamily: FONT_FAMILY, fontSize: 28, color: colors[sp] }}>{`${scene.names[sp] ?? ''}.js`}</div>
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 0, right: 0, top: paneH - 1, height: 2, background: withAlpha(C.text, 0.12) }} />
      <SceneNotes notes={scene.notes} frame={frame} fps={fps} width={width} height={height} top={heroOn ? 0.72 : 0.62} />
    </>
  );
};

/** WhatsApp vibe: the same timing data, rendered as a chat thread. */
const ChatSurface: React.FC<SceneProps<'lyricEditor'>> = ({ scene, storyboard, timing }) => {
  const { frame, fps, width, height, t } = useSceneClock(timing);
  const history: ChatMessage[] = [];
  const startSec = storyboard.song?.startSec ?? 0;
  let acc = 0;
  for (let i = 0; i < timing.index; i++) {
    const sc = storyboard.scenes[i]!;
    if (sc.type === 'lyricEditor') for (const l of sc.lines) if (l.raw) history.push({ text: l.raw, speaker: l.speaker, time: '' });
    acc += sc.durationSec;
  }
  const live: { raw: string; speaker: number; plans: LyricPlan[] }[] = [];
  scene.lines.forEach((l, i) => {
    const plan = timing.lyrics[i];
    if (!plan) return;
    if (l.raw) live.push({ raw: l.raw, speaker: l.speaker, plans: [plan] });
    else if (live.length > 0) live[live.length - 1]!.plans.push(plan);
  });
  const twistText = scene.reveal ? (scene.twist?.text ?? scene.lines[0]?.text.replace(/^\/\/\s*/, '') ?? null) : null;
  return <ChatView storyboard={storyboard} names={scene.names} history={history} live={scene.reveal ? [] : live} frame={frame} fps={fps} width={width} height={height} songTime={startSec + acc + t} system={twistText && frame > fps * 1.3 ? twistText : null} t={t} deleteK={scene.reveal ? interpolate(frame, [fps * 0.4, fps * 1.1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0} />;
};
