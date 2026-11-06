import React, { useMemo } from 'react';
import { AbsoluteFill, Easing, Freeze, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { VhsLook, CrtLook, GlitchBars } from '../effects/Looks';
import { VIBES, gradeFilter, mixGrade } from '../lib/vibes';
import { charFrame, doneFrame } from '../schema/timeline';
import { TWIST_T } from './TwistOverlay';
import { ThemeContext } from '../editor/theme';
import type { Scene, Storyboard } from '../schema/storyboard';
import { computeTimeline, type SceneTiming } from '../schema/timeline';
import { CodeEditorScene } from '../scenes/CodeEditorScene';
import { MacroCodeScene } from '../scenes/MacroCodeScene';
import { InsectScene } from '../scenes/InsectScene';
import { SunsetScene } from '../scenes/SunsetScene';
import { AmbientScene } from '../scenes/AmbientScene';
import { TypographyScene } from '../scenes/TypographyScene';
import { LyricEditorScene } from '../scenes/LyricEditorScene';
import { Hero } from './Hero';
import { FilmGrain } from '../effects/FilmGrain';
import { Vignette } from '../effects/Vignette';
import { AudioLayers, type AudioMix } from '../audio/AudioLayers';
import { COLORS, FONT_FAMILY, withAlpha } from '../editor/theme';
import { rng } from '../lib/seed';
import '../editor/fonts';

export type ReelProps = {
  storyboard: Storyboard;
  /** Studio tagline for the end card (shown only with a brand). */
  tagline?: string | null;
  /** Directory under public/ holding bed.wav and sfx.wav, or null for silent preview. */
  audioDir: string | null;
  /** Whether audioDir also contains music.wav. */
  hasMusic?: boolean;
  /** Stem gains. Song mode: music 1, bed ~0.25, sfx ~0.35. */
  mix?: AudioMix;
};

const SceneSwitch: React.FC<{ scene: Scene; storyboard: Storyboard; timing: SceneTiming }> = ({ scene, storyboard, timing }) => {
  switch (scene.type) {
    case 'codeEditor':
      return <CodeEditorScene scene={scene} storyboard={storyboard} timing={timing} />;
    case 'macroCode':
      return <MacroCodeScene scene={scene} storyboard={storyboard} timing={timing} />;
    case 'insect':
      return <InsectScene scene={scene} storyboard={storyboard} timing={timing} />;
    case 'sunset':
      return <SunsetScene scene={scene} storyboard={storyboard} timing={timing} />;
    case 'ambient':
      return <AmbientScene scene={scene} storyboard={storyboard} timing={timing} />;
    case 'typography':
      return <TypographyScene scene={scene} storyboard={storyboard} timing={timing} />;
    case 'lyricEditor':
      return <LyricEditorScene scene={scene} storyboard={storyboard} timing={timing} />;
  }
};

type Transition = 'none' | 'whipUp' | 'whipDown' | 'focusPull' | 'flash' | 'smear' | 'burn' | 'bokeh';
const ENTER = 7;
const EXIT = 5;

/** Film burns and bokeh hearts read as stock overlays: they fall back to plain cuts and focus pulls. */
const calm = (t: Transition): Transition => (t === 'burn' ? 'none' : t === 'bokeh' ? 'focusPull' : t);

function pickTransition(storyboard: Storyboard, index: number): Transition {
  const style = storyboard.transitions;
  const seed = storyboard.seed;
  const sc = storyboard.scenes[index];
  if (sc && sc.type === 'lyricEditor' && sc.cutIn !== 'auto') return calm(sc.cutIn);
  if (index === 0) return 'none';
  const roll = rng(seed, `transition-${index}`)();
  const cuts = VIBES[storyboard.vibe ?? 'gece'].cuts;
  if (storyboard.vibe && cuts.length) return calm(cuts[Math.floor(roll * cuts.length) % cuts.length]!);
  if (style === 'cut') return 'none';
  if (style === 'whip') return roll < 0.5 ? 'whipUp' : 'whipDown';
  return roll < 0.35 ? 'whipUp' : roll < 0.6 ? 'whipDown' : roll < 0.85 ? 'focusPull' : 'flash';
}

/** Enter/exit motion for a scene. Exit happens in the outgoing scene's last frames, enter in the incoming's first. */
const HERO_MASK = 'linear-gradient(180deg, transparent 0%, transparent 31%, black 45%, black 100%)';

const SceneFrame: React.FC<{ enter: Transition; exit: Transition; durationInFrames: number; warm: string; accent: string; heroMask: boolean; index: number; children: React.ReactNode }> = ({ enter, exit, durationInFrames, warm, accent, heroMask, index, children }) => {
  const frame = useCurrentFrame();
  const e = interpolate(frame, [0, ENTER], [0, 1], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const x = interpolate(frame, [durationInFrames - EXIT, durationInFrames - 1], [0, 1], { easing: Easing.in(Easing.quad), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  let translateY = 0;
  let blur = 0;
  let scale = 1;
  let flash = 0;
  let smear = 0;
  if (e < 1) {
    if (enter === 'smear') smear = 1 - e;
    if (enter === 'whipUp') { translateY = (1 - e) * 320; blur = (1 - e) * 26; }
    if (enter === 'whipDown') { translateY = -(1 - e) * 320; blur = (1 - e) * 26; }
    if (enter === 'focusPull') { blur = (1 - e) * 16; scale = 1.05 - 0.05 * e; }
    if (enter === 'flash') flash = frame < 2 ? 0.9 - frame * 0.4 : 0;
  }
  if (x > 0) {
    if (exit === 'whipUp') { translateY = -x * 320; blur = Math.max(blur, x * 26); }
    if (exit === 'whipDown') { translateY = x * 320; blur = Math.max(blur, x * 26); }
    if (exit === 'focusPull') { blur = Math.max(blur, x * 12); scale = 1 + 0.03 * x; }

    if (exit === 'smear') smear = Math.max(smear, x);
  }
  const smearId = `smear-${index}`;
  const filters = [smear > 0.02 ? `url(#${smearId})` : '', blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : ''].filter(Boolean).join(' ');
  return (
    <div style={{ position: 'absolute', inset: 0, transform: translateY !== 0 || scale !== 1 ? `translateY(${translateY.toFixed(1)}px) scale(${scale.toFixed(3)})` : undefined, filter: filters || undefined, WebkitMaskImage: heroMask ? HERO_MASK : undefined, maskImage: heroMask ? HERO_MASK : undefined }}>
      {smear > 0.02 ? (
        <svg width={0} height={0} style={{ position: 'absolute' }}>
          <filter id={smearId} x="-10%" y="0%" width="120%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.0006 0.06" numOctaves={1} seed={(frame % 5) + index * 3} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={(smear * 340).toFixed(0)} xChannelSelector="R" yChannelSelector="A" />
          </filter>
        </svg>
      ) : null}
      {children}
      {flash > 0.01 ? <div style={{ position: 'absolute', inset: 0, background: '#f4f1ec', opacity: flash, pointerEvents: 'none' }} /> : null}
    </div>
  );
};

export const Reel: React.FC<ReelProps> = ({ storyboard, audioDir, hasMusic = false, mix, tagline = null }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const timeline = useMemo(() => computeTimeline(storyboard, fps), [storyboard, fps]);
  const vibeR = VIBES[storyboard.vibe ?? 'gece'];
  // Sections: chorus lines (predict fx) and the twist window, in reel frames.
  const sections = useMemo(() => {
    const chorus: [number, number][] = [];
    const landings: number[] = [];
    let twistAt: number | null = null;
    for (const t of timeline.scenes) {
      const sc = storyboard.scenes[t.index]!;
      if (sc.type !== 'lyricEditor') continue;
      if (sc.reveal) twistAt = t.from + (sc.twist ? Math.round(TWIST_T.press * fps) : Math.round(fps * 0.3));
      t.lyrics.forEach((pl) => {
        if (pl.fx !== 'predict') return;
        chorus.push([t.from + pl.startFrame, t.from + doneFrame(pl)]);
        landings.push(t.from + doneFrame(pl));
      });
    }
    // Stutter on up to three chorus landings, at least 3 s apart.
    const stutters: number[] = [];
    if (vibeR.stutter) for (const f of storyboard.stutters ?? landings) if (stutters.length < 3 && (stutters.length === 0 || f - stutters[stutters.length - 1]! >= fps * 3)) stutters.push(f);
    // Light signature: from the moment its word is typed to the end of that shot, the whole frame is in light mode.
    let light: [number, number] | null = null;
    for (const t of timeline.scenes) {
      const sc = storyboard.scenes[t.index]!;
      if (sc.type !== 'lyricEditor') continue;
      sc.lines.forEach((l, i) => {
        const p = t.lyrics[i];
        if (!light && p && l.sig?.kind === 'light') light = [t.from + charFrame(p, l.sig.char), t.from + t.durationInFrames];
      });
    }
    return { chorus, twistAt, stutters, light: light as [number, number] | null };
  }, [timeline, storyboard, fps, vibeR.stutter]);

  const last = timeline.scenes[timeline.scenes.length - 1]!;
  const active = timeline.scenes.find((s) => frame >= s.from && frame < s.from + s.durationInFrames) ?? last;
  const scene = storyboard.scenes[active.index]!;
  const localFrame = frame - active.from;
  const progress = Math.min(1, localFrame / Math.max(1, active.durationInFrames - 1));
  const fx = scene.effects;

  const vibe = VIBES[storyboard.vibe ?? 'gece'];
  const theme = vibe.colors;
  const hasHero = (storyboard.hero ?? 'none') !== 'none' && vibe.surface === 'editor';

  // Kick-drum punch (falls back to the beat pulse when no kicks were detected).
  const kicks = storyboard.kicks ?? [];
  let lastKick = -1e9;
  for (const k of kicks) {
    if (k > frame) break;
    lastKick = k;
  }
  const kickPunch = kicks.length ? Math.exp(-(frame - lastKick) / 3.2) * vibe.punch : 0;
  // Snare: a small sideways nudge and roll, alternating direction, like an operator reacting to the backbeat.
  const snares = storyboard.snares ?? [];
  let lastSnare = -1e9;
  let snareN = 0;
  for (const k of snares) {
    if (k > frame) break;
    lastSnare = k;
    snareN++;
  }
  const snareAge = frame - lastSnare;
  const nudge = snareAge < 14 ? Math.exp(-snareAge / 2.6) * Math.min(1.4, Math.max(0.5, vibe.punch * 1.6)) * (snareN % 2 ? 1 : -1) : 0;

  // Pattern breaks and drop entrances: snap zoom + glitch.
  const breakFrames = (storyboard.breaks ?? []).map((b) => Math.round(b * fps));
  const dropFrames = timeline.scenes.filter((s) => { const sc = storyboard.scenes[s.index]!; return sc.type === 'lyricEditor' && sc.cutIn === 'flash'; }).map((s) => s.from);
  const hitAge = Math.min(...[...breakFrames, ...dropFrames].map((f) => (frame >= f ? frame - f : 1e9)), 1e9);
  const snap = hitAge < 10 ? Math.exp(-hitAge / 3) : 0;
  const glitch = (hitAge < 6 ? 1 - hitAge / 6 : 0) * vibe.glitch;

  // Hooks.
  const hook = storyboard.hook ?? null;
  const ffFrames = hook?.style === 'flashforward' ? Math.round(fps * 0.8) : 0;
  const loop = storyboard.ending === 'loop';
  const episode = storyboard.episode ?? null;
  const level = storyboard.levels?.[frame] ?? 0;
  const isReveal = scene.type === 'lyricEditor' && scene.reveal;
  const heroPresence = isReveal ? interpolate(localFrame, [0, 10], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;

  // Tail: fade to black. The studio name is not an end card; it sits in the corner through the middle of the reel.
  const tail = fps * 1.1;
  const fade = interpolate(frame, [timeline.totalFrames - tail, timeline.totalFrames - tail * 0.72], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const brand = storyboard.brand?.trim() ?? '';
  // Brand mark: types itself in once the first scene is over, stays until the reveal starts.
  const markIn = timeline.scenes[1]?.from ?? Math.round(fps * 4);
  const markOut = last.from;
  const markChars = Math.max(0, Math.min(brand.length, Math.floor((frame - markIn) / 2) + 1));
  const markOn = brand !== '' && frame >= markIn && frame < markOut;
  const markOpacity = interpolate(frame, [markOut - 6, markOut], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Beat pulse: a tiny push on every beat when the reel is cut to music, decaying over ~5 frames.
  const beatSec = storyboard.audio.beatSec ?? null;
  let beatPulse = 0;
  if (beatSec) {
    const beatFrames = beatSec * fps;
    const offset = (storyboard.audio.beatOffset ?? 0) * fps;
    const phase = (((frame - offset) % beatFrames) + beatFrames) % beatFrames;
    beatPulse = Math.exp(-phase / 4.5);
  }

  // Colour grade per section: verse, chorus, twist.
  let chorusK = 0;
  for (const [a, b] of sections.chorus) chorusK = Math.max(chorusK, Math.min(1, Math.max(0, (frame - a + 2) / 6)) * Math.min(1, Math.max(0, (b + 14 - frame) / 12)));
  const twistK = sections.twistAt !== null ? Math.min(1, Math.max(0, (frame - sections.twistAt) / 8)) : 0;
  const grade = gradeFilter(mixGrade(mixGrade(vibe.grade.verse, vibe.grade.chorus, chorusK), vibe.grade.twist, twistK));

  // Stutter edit: replay three frames twice right after a chorus line lands.
  let stutterShow: number | null = null;
  for (const st of sections.stutters) {
    const d = frame - st - 3;
    if (d >= 0 && d < 6) stutterShow = st + (d % 3);
  }

  // Speed ramp: the camera creeps in and over-exposes just before each drop, then the cut hits.
  let ramp = 0;
  for (const d of dropFrames) if (frame >= d - 16 && frame < d) ramp = Math.max(ramp, ((frame - (d - 16)) / 16) ** 3);

  // Endings: CRT power-off or "saved" + window close, both before the studio card.
  const ending = storyboard.ending ?? 'card';
  const endStart = timeline.totalFrames - tail;
  const endEnd = timeline.totalFrames - tail * 0.72;
  const endK = interpolate(frame, [endStart, endEnd], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  let wrapTransform = '';
  let wrapFilter = '';
  let wrapRadius = 0;
  if (ending === 'crt' && endK > 0) {
    const sy = endK < 0.6 ? 1 - Math.pow(endK / 0.6, 0.6) * 0.995 : 0.005;
    const sx = endK < 0.6 ? 1 : Math.max(0, 1 - (endK - 0.6) / 0.4);
    wrapTransform = `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    wrapFilter = `brightness(${(1 + endK * 3).toFixed(2)})`;
  }
  const saveAt = endStart - Math.round(fps * 0.9);
  if (ending === 'save' && endK > 0) {
    const k = Easing.in(Easing.cubic)(endK);
    wrapTransform = `translateY(${(k * 60).toFixed(1)}px) scale(${(1 - 0.14 * k).toFixed(4)})`;
    wrapRadius = 40 * Math.min(1, endK * 4);
  }
  const lightOn = sections.light !== null && frame >= sections.light[0] && frame < sections.light[1];
  const endFade = ending === 'crt' ? interpolate(frame, [endEnd - 2, endEnd], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : fade;

  return (
    <ThemeContext.Provider value={theme}>
    <AbsoluteFill lang="tr" style={{ background: theme.bg, isolation: 'isolate', overflow: 'hidden' }}>
      {/* Shared editor backdrop: the oversized code canvas is transparent so its edges never show. */}
      {lightOn ? <div style={{ position: 'absolute', inset: 0, background: '#f4f3f0' }} /> : null}
      {ending === 'crt' && endK > 0 ? <div style={{ position: 'absolute', inset: 0, background: '#000' }} /> : null}
      <div style={{ position: 'absolute', inset: 0, transform: wrapTransform || undefined, filter: [grade, wrapFilter, lightOn ? 'invert(1) hue-rotate(180deg)' : ''].filter(Boolean).join(' '), borderRadius: wrapRadius, overflow: wrapRadius ? 'hidden' : undefined, boxShadow: wrapRadius ? '0 40px 120px rgba(0,0,0,0.8)' : undefined }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${(1 + (kicks.length ? 0 : beatPulse * 0.014) + kickPunch * 0.028 + snap * 0.07 + ramp * 0.1).toFixed(4)}) translateX(${(glitch * (frame % 2 ? 14 : -14) + nudge * 9).toFixed(1)}px) rotate(${(nudge * 0.35).toFixed(3)}deg)`, transformOrigin: '50% 55%', filter: ramp > 0.02 ? `brightness(${(1 + ramp * 0.25).toFixed(2)})` : undefined }}>
        <Freeze frame={stutterShow ?? 0} active={stutterShow !== null}>
        {timeline.scenes.map((t) => (
          <Sequence key={t.index} name={`${t.index + 1}. ${t.type}`} from={t.from} durationInFrames={t.durationInFrames} premountFor={fps}>
            <SceneFrame enter={pickTransition(storyboard, t.index)} exit={pickTransition(storyboard, t.index + 1)} durationInFrames={t.durationInFrames} warm={storyboard.palette.warm} accent={storyboard.palette.accent} index={t.index} heroMask={hasHero && storyboard.scenes[t.index]!.type === 'lyricEditor' && !(storyboard.scenes[t.index] as { reveal?: boolean }).reveal}>
              <SceneSwitch scene={storyboard.scenes[t.index]!} storyboard={storyboard} timing={t} />
            </SceneFrame>
          </Sequence>
        ))}
        </Freeze>
      </div>

      {hasHero ? <Hero kind={storyboard.hero!} frame={frame} fps={fps} width={width} height={height} storyboard={storyboard} level={level} presence={heroPresence} punch={Math.min(1, kickPunch)} /> : null}
      </div>
      {ending === 'crt' && endK > 0.3 && endK < 1 ? <div style={{ position: 'absolute', left: width * 0.5 * (1 - Math.max(0, 1 - (endK - 0.6) / 0.4)), right: width * 0.5 * (1 - Math.max(0, 1 - (endK - 0.6) / 0.4)), top: height / 2 - 3, height: 6, background: '#fff', opacity: endK < 0.6 ? 1 : 1 - (endK - 0.6) / 0.6 }} /> : null}
      {ending === 'save' && frame >= saveAt && frame < endEnd ? <SaveToast frame={frame - saveAt} fps={fps} width={width} height={height} accent={storyboard.palette.accent} filename={(() => { const sc = storyboard.scenes[last.index]!; return sc.type === 'lyricEditor' ? sc.filename : 'song.js'; })()} /> : null}

      {/* Global overlays as top-level siblings so blend modes composite against the whole frame. */}
      <FilmGrain intensity={fx.grain * vibe.grain * 0.5} seed={storyboard.seed} frame={frame} width={width} height={height} />
      {vibe.overlay === 'vhs' ? <VhsLook frame={frame} fps={fps} width={width} height={height} songTime={storyboard.song?.startSec ?? 0} /> : null}
      {vibe.overlay === 'crt' ? <CrtLook frame={frame} width={width} height={height} color={storyboard.palette.accent} /> : null}
      <GlitchBars amount={glitch} frame={frame} seed={storyboard.seed} width={width} height={height} />
      <Vignette strength={(vibe.id === 'ask' ? fx.vignette * 0.35 : fx.vignette) * (lightOn ? 0 : 1)} />

      {/* Studio mark: the name as a file in the editor's own type, a block cursor after it. Quiet, no badge. */}
      {markOn ? (
        <div style={{ position: 'absolute', left: 56, top: hasHero ? height * 0.285 : 120, display: 'flex', alignItems: 'center', fontFamily: FONT_FAMILY, fontSize: 32, fontWeight: 500, color: withAlpha(theme.text, 0.72), opacity: markOpacity }}>
          {brand.slice(0, markChars)}
          <span style={{ display: 'inline-block', width: '0.55em', height: '1.05em', marginLeft: '0.1em', background: storyboard.palette.accent, opacity: markChars < brand.length || Math.floor(frame / 15) % 2 === 0 ? 0.85 : 0 }} />
        </div>
      ) : null}

      {/* Hook: the question the twist answers, on screen from frame 0 (also the thumbnail). */}
      {hook?.style === 'question' && hook.text ? <HookCard text={hook.text} frame={frame} fps={fps} width={width} height={height} accent={storyboard.palette.accent} top={hasHero ? height * 0.36 : height * 0.2} /> : null}
      {episode !== null ? (
        <div style={{ position: 'absolute', left: 56, top: hasHero ? height * 0.285 : 120, fontFamily: FONT_FAMILY, fontSize: 30, color: theme.textDim, opacity: interpolate(frame, [0, 4, fps * 2.6, fps * 3], [1, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          #{String(episode).padStart(3, '0')}
        </div>
      ) : null}
      {/* Flash-forward hook: a glimpse of the ending, rewound. */}
      {ffFrames > 0 && frame < ffFrames ? (
        <div style={{ position: 'absolute', inset: 0, background: theme.bg }}>
          {/* Tease the payoff without giving it away: freeze just before the twist fires. */}
          <Freeze frame={Math.round(fps * 0.55)}>
            <SceneSwitch scene={storyboard.scenes[last.index]!} storyboard={storyboard} timing={last} />
          </Freeze>
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 7px)', transform: `translateY(${(frame * 23) % 7}px)` }} />
          <GlitchBars amount={0.8} frame={frame} seed={storyboard.seed + 7} width={width} height={height} />
          <div style={{ position: 'absolute', left: 56, top: height * 0.44, fontFamily: FONT_FAMILY, fontSize: 56, fontWeight: 500, color: '#fff' }}>{'◀◀ geri sar'}</div>
        </div>
      ) : null}
      {/* Seamless loop: the last frames dissolve into frame 0 so the video replays without a seam. */}
      {loop ? (
        <div style={{ position: 'absolute', inset: 0, opacity: interpolate(frame, [timeline.totalFrames - 12, timeline.totalFrames - 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <Freeze frame={0}>
            <div style={{ position: 'absolute', inset: 0, background: theme.bg }}>
              <SceneSwitch scene={storyboard.scenes[0]!} storyboard={storyboard} timing={timeline.scenes[0]!} />
              {hook?.style === 'question' && hook.text ? <HookCard text={hook.text} frame={0} fps={fps} width={width} height={height} accent={storyboard.palette.accent} top={hasHero ? height * 0.36 : height * 0.2} /> : null}
            </div>
          </Freeze>
        </div>
      ) : null}
      <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: loop ? 0 : endFade, pointerEvents: 'none' }} />
      <AudioLayers audioDir={audioDir} hasMusic={hasMusic} totalFrames={timeline.totalFrames} mix={mix} />
    </AbsoluteFill>
    </ThemeContext.Provider>
  );
};

/** Hook question: full size at frame 0, then it docks into a small tag and fades by ~2.6 s. */
const HookCard: React.FC<{ text: string; frame: number; fps: number; width: number; height: number; accent: string; top: number }> = ({ text, frame, fps, width, height, accent, top }) => {
  // With a hero piece on top there is no room to dock: the card settles in place and fades.
  const docks = top < height * 0.3;
  const dock = interpolate(frame, [fps * 1.6, fps * 2.1], [0, 1], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const out = interpolate(frame, [fps * 2.3, fps * 2.7], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const size = Math.min(76, Math.floor((width * 0.84) / ((Math.min(text.length, 22) + 3) * 0.6)));
  return (
    <div style={{ position: 'absolute', left: width * 0.07, right: width * 0.07, top: top - (docks ? dock * (top - 200) : 0), opacity: out, transform: `scale(${1 - dock * (docks ? 0.45 : 0.08)})`, transformOrigin: '0% 0%', fontFamily: FONT_FAMILY }}>
      <div style={{ display: 'inline-block', background: 'rgba(8,7,6,0.88)', border: '2px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '26px 32px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: size, fontWeight: 700, color: '#fff6ee', lineHeight: 1.25, whiteSpace: 'pre-wrap' }}>
          <span style={{ color: '#8a8178' }}>{'// '}</span>
          {text}
          <span style={{ display: 'inline-block', width: '0.55em', height: '1em', verticalAlign: '-0.14em', marginLeft: 8, background: accent, opacity: Math.floor(frame / 9) % 2 === 0 ? 1 : 0.15 }} />
        </div>
      </div>
    </div>
  );
};

/** "Saved" status for the save ending: a quiet editor notice under the code, then the window closes. */
const SaveToast: React.FC<{ frame: number; fps: number; width: number; height: number; accent: string; filename: string }> = ({ frame, width, height, filename }) => {
  const k = interpolate(frame, [0, 6], [0, 1], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: height * 0.84 + (1 - k) * 16, display: 'flex', justifyContent: 'center', opacity: k, fontFamily: FONT_FAMILY }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 32px', borderRadius: 12, background: '#1a1817', border: '2px solid rgba(255,255,255,0.08)', maxWidth: width * 0.86 }}>
        <svg width={32} height={32} viewBox="0 0 32 32">
          <path d="M7 16.5 L13.5 23 L25 10" fill="none" stroke="#7fc99a" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ fontSize: 34, color: '#e9e4dc' }}>Kaydedildi</div>
        <div style={{ fontSize: 28, color: '#8a8178' }}>{filename}</div>
      </div>
    </div>
  );
};
