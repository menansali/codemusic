import { promises as fs } from 'node:fs';
import path from 'node:path';
import { generateStoryboard, type GenerateOptions, type GenerateResult } from '../generator/generate';
import { fingerprint } from '../generator/normalize';
import { hashString } from '../lib/seed';
import { computeTimeline } from '../schema/timeline';
import { synthesizeStems } from '../audio/synth';
import { loudnormAndFaststart, prepareMusic } from '../audio/post';
import { applySongFx, planSongFx } from '../audio/songfx';
import { BROWSER, createBundle, renderReel, ROOT } from '../render/render';
import { probe, validateProbe } from '../render/validate';
import { writeManifest, type Manifest } from '../render/manifest';
import { renderSettings, VIDEO, type RenderQuality } from '../lib/renderSettings';
import { modelId } from '../generator/client';
import type { ReelProps } from '../composition/Reel';
import type { AudioMix } from '../audio/AudioLayers';
import { analyzeBeat, snapToBeat } from '../audio/beat';
import { findHook, loadLrc, type LyricLine } from '../lyrics/lrc';
import { buildSongStoryboard } from '../lyrics/songboard';
import { loadStory, type Story } from '../lyrics/story';
import { loadStudio } from '../lib/studio';
import { frameLevels, findDrops, kickFrames, snareFrames } from '../audio/levels';
import { pickSignature } from '../lyrics/signature';
import type { WordTimes } from '../lyrics/songboard';
import { VIBES, VIBE_IDS, pickVibe, type VibeId } from '../lib/vibes';
import { computeBreaks } from '../lyrics/songboard';
import { fold } from '../lyrics/lexicon';
import { writeCaption } from '../lyrics/caption';
import { codifyWithClaude } from '../lyrics/claudeCodify';
import { splitSpeaker } from '../lyrics/songboard';
import { hashString as hashStr } from '../lib/seed';
import { HERO_KINDS } from '../schema/storyboard';
import { run, ffmpegBin } from '../audio/post';
import { renderStill, selectComposition } from '@remotion/renderer';
import { normalize } from '../generator/normalize';
import type { Manifest as ManifestT } from '../render/manifest';

export const OUTPUT_ROOT = path.join(ROOT, 'output');
export const PUBLIC_AUDIO = path.join(ROOT, 'public', 'audio');
export const MUSIC_DIR = path.join(ROOT, 'assets', 'music');

export type ProduceOptions = Omit<GenerateOptions, 'log'> & {
  quality: RenderQuality;
  dryRun?: boolean;
  log: (msg: string) => void;
};

type Prepared = {
  gen: GenerateResult;
  outDir: string;
  audioRel: string;
  audioAbs: string;
  musicUsed: string | null;
  mix?: AudioMix;
  song?: ManifestT['song'];
};

async function uniqueDir(id: string): Promise<string> {
  let dir = path.join(OUTPUT_ROOT, id);
  let n = 2;
  while (true) {
    try {
      await fs.access(dir);
      dir = path.join(OUTPUT_ROOT, `${id}-${n++}`);
    } catch {
      return dir;
    }
  }
}

async function findMusic(preferred: string | null): Promise<string | null> {
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(MUSIC_DIR)).filter((f) => /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(f)).sort();
  } catch {
    return null;
  }
  if (entries.length === 0) return null;
  if (preferred && entries.includes(preferred)) return path.join(MUSIC_DIR, preferred);
  return path.join(MUSIC_DIR, entries[0] as string);
}

/** Generate storyboard + audio stems; nothing rendered yet. */
export async function prepare(opts: ProduceOptions): Promise<Prepared> {
  const gen = await generateStoryboard({ ...opts, log: opts.log });
  const sb = gen.storyboard;
  const outDir = await uniqueDir(sb.id);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'storyboard.json'), JSON.stringify(sb, null, 2));
  opts.log(`Storyboard "${sb.title}" (${gen.generator}${gen.model ? `, ${gen.model}` : ''}) -> ${path.relative(ROOT, outDir)}`);

  const timeline = computeTimeline(sb, VIDEO.fps);
  const audioRel = `audio/${path.basename(outDir)}`;
  const audioAbs = path.join(PUBLIC_AUDIO, path.basename(outDir));
  await synthesizeStems(sb, timeline, audioAbs);
  let musicUsed: string | null = null;
  const music = await findMusic(sb.audio.musicFile ?? null);
  if (music) {
    await prepareMusic(music, path.join(audioAbs, 'music.wav'), timeline.totalFrames / VIDEO.fps);
    musicUsed = path.basename(music);
    opts.log(`Music: ${musicUsed}`);
  }
  opts.log(`Audio stems synthesized (${timeline.typingFrames.length} key clicks, ${timeline.cuts.length} cuts).`);
  return { gen, outDir, audioRel, audioAbs, musicUsed };
}

/** Render a prepared job with an existing bundle, post-process, validate and write the manifest. */
export async function finish(p: Prepared, serveUrl: string, opts: ProduceOptions): Promise<Manifest> {
  const sb = p.gen.storyboard;
  const timeline = computeTimeline(sb, VIDEO.fps);
  const rawVideo = path.join(p.outDir, 'video.raw.mp4');
  const finalVideo = path.join(p.outDir, 'video.mp4');
  const studio = await loadStudio(ROOT);
  const props: ReelProps = { storyboard: sb, audioDir: p.audioRel, hasMusic: p.musicUsed !== null, mix: p.mix, tagline: studio.tagline || null };

  let lastPct = -1;
  const { ms } = await renderReel({
    serveUrl,
    props,
    outputLocation: rawVideo,
    quality: opts.quality,
    onProgress: ({ progress, renderedFrames, stage }) => {
      const pct = Math.floor(progress * 100);
      if (pct !== lastPct && pct % 10 === 0) {
        lastPct = pct;
        opts.log(`Rendering ${pct}% (${renderedFrames}/${timeline.totalFrames} frames${stage ? `, ${stage}` : ''})`);
      }
    },
  });
  opts.log(`Rendered in ${(ms / 1000).toFixed(1)}s. Normalizing loudness...`);
  await loudnormAndFaststart(rawVideo, finalVideo);
  await fs.rm(rawVideo, { force: true });

  const pr = await probe(finalVideo);
  const validation = validateProbe(pr, { width: VIDEO.width, height: VIDEO.height, fps: VIDEO.fps, durationSec: timeline.totalFrames / VIDEO.fps, frames: timeline.totalFrames });
  if (validation.ok) opts.log(`Validated: ${pr.width}x${pr.height} ${pr.frameRate} fps, ${pr.duration.toFixed(2)}s, ${pr.codec}/${pr.audioCodec}, ${(pr.sizeBytes / 1e6).toFixed(1)} MB`);
  else opts.log(`VALIDATION FAILED: ${validation.errors.join('; ')}`);

  // Keep stems with the output, remove them from public/ so later bundles stay small.
  const keptAudio = path.join(p.outDir, 'audio');
  await fs.mkdir(keptAudio, { recursive: true });
  for (const f of ['bed.wav', 'sfx.wav', 'music.wav']) {
    try {
      await fs.copyFile(path.join(p.audioAbs, f), path.join(keptAudio, f));
    } catch {
      /* optional */
    }
  }
  await fs.rm(p.audioAbs, { recursive: true, force: true });

  const settings = renderSettings(opts.quality);
  const manifest: Manifest = {
    id: path.basename(p.outDir),
    topic: sb.topic,
    title: sb.title,
    concept: sb.concept,
    seed: sb.seed,
    generator: p.gen.generator,
    model: p.gen.model,
    createdAt: new Date().toISOString(),
    durationSec: timeline.totalFrames / VIDEO.fps,
    frames: timeline.totalFrames,
    fps: VIDEO.fps,
    width: VIDEO.width,
    height: VIDEO.height,
    files: {
      video: path.relative(ROOT, finalVideo),
      storyboard: path.relative(ROOT, path.join(p.outDir, 'storyboard.json')),
      bed: path.relative(ROOT, path.join(keptAudio, 'bed.wav')),
      sfx: path.relative(ROOT, path.join(keptAudio, 'sfx.wav')),
      music: p.musicUsed ? path.relative(ROOT, path.join(keptAudio, 'music.wav')) : null,
    },
    scenes: timeline.scenes.map((t) => ({ index: t.index, type: t.type, durationSec: sb.scenes[t.index]!.durationSec, from: t.from, durationInFrames: t.durationInFrames })),
    render: { quality: opts.quality, ms, crf: settings.crf, preset: settings.x264Preset, concurrency: settings.concurrency },
    probe: pr,
    validation,
    notes: p.gen.notes,
    ...(p.song ? { song: p.song } : {}),
  };
  await writeManifest(p.outDir, manifest);
  return manifest;
}

/** Single video end to end. */
export async function produce(opts: ProduceOptions): Promise<Manifest | null> {
  const prepared = await prepare(opts);
  if (opts.dryRun) {
    opts.log('Dry run: storyboard and audio stems written, render skipped.');
    await fs.rm(prepared.audioAbs, { recursive: true, force: true });
    return null;
  }
  opts.log('Bundling composition...');
  const serveUrl = await createBundle();
  return finish(prepared, serveUrl, opts);
}

/** Batch: generate + synth everything first, bundle once, render sequentially. */
export async function produceBatch(count: number, opts: ProduceOptions): Promise<Manifest[]> {
  const prepared: Prepared[] = [];
  const used: string[] = [];
  for (let i = 0; i < count; i++) {
    opts.log(`\n=== Video ${i + 1} of ${count} ===`);
    const baseSeed = opts.seed ?? hashString(opts.topic);
    const p = await prepare({ ...opts, variant: i, seed: (baseSeed + i * 7919) >>> 0, avoidFingerprints: used });
    used.push(fingerprint(p.gen.storyboard));
    prepared.push(p);
  }
  if (opts.dryRun) {
    for (const p of prepared) await fs.rm(p.audioAbs, { recursive: true, force: true });
    return [];
  }
  opts.log('\nBundling composition once for the batch...');
  const serveUrl = await createBundle();
  const manifests: Manifest[] = [];
  for (let i = 0; i < prepared.length; i++) {
    opts.log(`\n=== Rendering ${i + 1} of ${count}: ${prepared[i]!.gen.storyboard.title} ===`);
    manifests.push(await finish(prepared[i]!, serveUrl, opts));
  }
  return manifests;
}

export type SongOptions = {
  music: string;
  lyrics?: string;
  story?: string;
  start?: number;
  hook?: string;
  bpm?: number;
  names: string[];
  title: string;
  artist: string;
  seconds: number;
  seed?: number;
  brand?: string | null;
  quality: RenderQuality;
  dryRun?: boolean;
  hero?: string;
  vibe?: string;
  ending?: 'auto' | 'card' | 'loop' | 'crt' | 'save';
  /** 1 = single video; 2 = also render variant B with the flash-forward hook. */
  variants?: number;
  episode?: number | null;
  claude?: boolean;
  /** Signature effect: auto (from the title/lyrics) | none | yinyang | mirror | loop | retro | light. */
  signature?: string;
  log: (msg: string) => void;
};

export const SONG_MIX: AudioMix = { bed: 0.2, sfx: 0.3, music: 1 };

/** Lyric-as-code reel cut to a song section. */
export async function prepareSong(opts: SongOptions): Promise<Prepared> {
  const log = opts.log;
  log('Analyzing the track (tempo, beat grid, loudest section)...');
  let lyrics: LyricLine[] = [];
  if (opts.lyrics) lyrics = await loadLrc(opts.lyrics);
  let hint: number | null = opts.start ?? null;
  if (hint === null && opts.hook && lyrics.length > 0) {
    const h = findHook(lyrics, opts.hook);
    if (h) hint = Math.max(0, h.t - 0.3);
    else log(`Hook "${opts.hook}" not found in the lyrics; using the loudest section.`);
  }
  const beat = await analyzeBeat(opts.music, opts.seconds, hint);
  if (opts.bpm) {
    beat.bpm = opts.bpm;
    beat.beatSec = 60 / opts.bpm;
  }
  const rawStart = hint ?? beat.loudestStart;
  const start = Math.max(0, Math.min(beat.durationSec - opts.seconds, snapToBeat(rawStart, beat.beatSec, beat.firstBeat, 'floor')));
  log(`Tempo ${beat.bpm.toFixed(1)} BPM, section ${start.toFixed(2)}s to ${(start + opts.seconds).toFixed(2)}s${lyrics.length ? `, ${lyrics.filter((l) => l.t >= start && l.t < start + opts.seconds && l.text).length} lyric lines` : ''}.`);

  const studio = await loadStudio(ROOT);
  let story: Story | null = null;
  if (opts.story) {
    story = await loadStory(opts.story);
    log(`Story: ${story.notes.length} note(s)${story.twist ? ', twist at the end' : ''}.`);
  }
  const frames = Math.round(opts.seconds * VIDEO.fps);
  const levels = await frameLevels(opts.music, VIDEO.fps, frames, start);
  const drops = findDrops(levels, VIDEO.fps);
  if (drops.length) log(`Energy jumps at ${drops.map((d) => d.toFixed(1) + 's').join(', ')} (big entrances there).`);

  const windowLyrics = lyrics.filter((l) => l.t >= start && l.t < start + opts.seconds && l.text.trim()).map((l) => splitSpeaker(l.text, opts.names).text);
  const codified = opts.claude === false ? null : await codifyWithClaude(windowLyrics, { title: opts.title, artist: opts.artist }, log);
  if (!codified) log('Code lines: built-in converter.');

  const words = windowLyrics.flatMap((l) => l.split(/\s+/)).map((w) => fold(w).replace(/[^a-z]/g, '')).filter(Boolean);
  const meanLevel = levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length);
  const vibeOpt = opts.vibe ?? studio.vibe ?? 'auto';
  const vibe: VibeId = (VIBE_IDS as readonly string[]).includes(vibeOpt) ? (vibeOpt as VibeId) : pickVibe({ bpm: beat.bpm, meanLevel, words });
  const V = VIBES[vibe];
  log(`Vibe: ${V.label}${vibeOpt === 'auto' ? ' (auto)' : ''}.`);
  const kicks = V.punch > 0 ? await kickFrames(opts.music, VIDEO.fps, frames, start) : [];
  const snares = V.punch > 0 ? await snareFrames(opts.music, VIDEO.fps, frames, start) : [];
  log(`Kicks: ${kicks.length}, snares: ${snares.length}.`);
  // Word timings (from the aligner) drive held notes; without them nothing is stretched.
  let wordTimes: WordTimes | null = null;
  if (opts.lyrics) {
    const wf = opts.lyrics.replace(/\.lrc$/i, '') + '.words.json';
    wordTimes = await fs.readFile(wf, 'utf8').then((t) => JSON.parse(t) as WordTimes).catch(() => null);
    log(wordTimes ? `Word timings: ${path.basename(wf)} (held notes on).` : 'Word timings: none (held notes off; run the aligner to add them).');
  }
  const signature = pickSignature(opts.title, windowLyrics, opts.signature);

  const heroOpt = (opts.hero ?? (studio.hero !== 'auto' ? studio.hero : V.hero)) as string;
  const choices = HERO_KINDS.filter((h) => h !== 'none' && h !== 'neon');
  const hero = (HERO_KINDS as readonly string[]).includes(heroOpt) ? (heroOpt as (typeof HERO_KINDS)[number]) : choices[hashStr(`${opts.artist}-${opts.title}`) % choices.length]!;
  log(`Hero set piece: ${hero}.`);
  const vibeStudio = { ...studio, palette: V.palette, props: V.props, transitions: V.transitions };

  const wire = buildSongStoryboard({ title: opts.title, artist: opts.artist, names: opts.names, lyrics, start, seconds: opts.seconds, beatSec: beat.beatSec, firstBeat: beat.firstBeat, story, studio: vibeStudio, drops, codified, seed: opts.seed, words: wordTimes, signature });
  const sigLine = wire.scenes.flatMap((sc) => (sc.type === 'lyricEditor' ? sc.lines : [])).find((l) => l.sig);
  log(`Signature effect: ${signature}${signature === 'none' || signature === 'yinyang' ? '' : sigLine ? ` on "${sigLine.text}"` : ' (its word is not in this section, skipped)'}.`);
  const holds = wire.scenes.flatMap((sc) => (sc.type === 'lyricEditor' ? sc.lines : [])).filter((l) => l.hold).length;
  if (wordTimes) log(`Held notes: ${holds}.`);
  const breaks = computeBreaks(wire, beat.beatSec, wire.audio.beatOffset ?? 0);
  const episode = opts.episode !== undefined ? opts.episode : studio.episodes ? (await countSongReels()) + 1 : null;
  const storyboard = normalize(wire, {
    targetDuration: opts.seconds,
    seed: opts.seed ?? wire.seed,
    brand: opts.brand ?? (studio.name || null),
    hero,
    song: { title: opts.title, artist: opts.artist, startSec: start, durationSec: beat.durationSec },
    levels,
    extra: {
      vibe,
      kicks,
      snares,
      signature,
      breaks,
      hook: studio.hookStyle === 'question' && story?.hook ? { style: 'question', text: story.hook } : { style: studio.hookStyle === 'question' ? 'macro' : studio.hookStyle, text: story?.hook ?? null },
      // A join twist ends mid-line on the new cursor: the plain card keeps that cliffhanger.
      ending: (() => { const e = opts.ending ?? studio.ending; return e === 'auto' ? (story?.twist?.kind === 'join' ? 'card' : V.ending) : e; })(),
      episode,
    },
  });
  const gen: GenerateResult = { storyboard, generator: codified ? 'claude' : 'fallback', model: codified ? modelId() : null, notes: [`Song mode: code lines by ${codified ? 'Claude' : 'the built-in converter'}; hero ${hero}.`] };

  const outDir = await uniqueDir(storyboard.id);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'storyboard.json'), JSON.stringify(storyboard, null, 2));
  log(`Storyboard "${storyboard.title}" -> ${path.relative(ROOT, outDir)} (${storyboard.scenes.length} scenes)`);

  const timeline = computeTimeline(storyboard, VIDEO.fps);
  const audioRel = `audio/${path.basename(outDir)}`;
  const audioAbs = path.join(PUBLIC_AUDIO, path.basename(outDir));
  await synthesizeStems(storyboard, timeline, audioAbs, { whooshes: false, clickGain: 0.8 });
  await prepareMusic(opts.music, path.join(audioAbs, 'music.wav'), timeline.totalFrames / VIDEO.fps, start, true);
  const fxPlan = planSongFx(storyboard, timeline);
  await applySongFx(path.join(audioAbs, 'music.wav'), fxPlan);
  log(`Song edit: ${fxPlan.drops.length} filter sweep(s), ${fxPlan.swells.length} reverse swell(s)${fxPlan.tapeStop !== null ? `, tape stop at ${fxPlan.tapeStop.toFixed(2)}s` : ''}.`);
  log(`Audio: music from ${start.toFixed(2)}s, ${timeline.typingFrames.length} key clicks, bed under the track.`);
  return {
    gen,
    outDir,
    audioRel,
    audioAbs,
    musicUsed: path.basename(opts.music),
    mix: SONG_MIX,
    song: { file: path.basename(opts.music), startSec: start, bpm: beat.bpm, lyrics: opts.lyrics ? path.basename(opts.lyrics) : null, names: opts.names },
  };
}

export async function produceSong(opts: SongOptions): Promise<Manifest | null> {
  const prepared = await prepareSong(opts);
  if (opts.dryRun) {
    opts.log('Dry run: storyboard and audio stems written, render skipped.');
    await fs.rm(prepared.audioAbs, { recursive: true, force: true });
    return null;
  }
  opts.log('Bundling composition...');
  const serveUrl = await createBundle();
  const manifest = await finish(prepared, serveUrl, { topic: opts.title, quality: opts.quality, log: opts.log });
  await postExtras(prepared, serveUrl, manifest, opts.log);
  await writeCaption(prepared.gen.storyboard, prepared.outDir, opts.log);
  if ((opts.variants ?? 1) >= 2) await renderVariantB(prepared, serveUrl, opts);
  return manifest;
}

async function countSongReels(): Promise<number> {
  let n = 0;
  try {
    for (const d of await fs.readdir(OUTPUT_ROOT)) {
      try {
        const m = JSON.parse(await fs.readFile(path.join(OUTPUT_ROOT, d, 'manifest.json'), 'utf8')) as { song?: unknown };
        if (m.song) n++;
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no output yet */
  }
  return n;
}

/** Variant B: same reel, flash-forward hook instead of the question card. Rendered next to video.mp4. */
async function renderVariantB(p: Prepared, serveUrl: string, opts: SongOptions): Promise<void> {
  const sb = { ...p.gen.storyboard, hook: { style: 'flashforward' as const, text: null } };
  opts.log('Rendering variant B (flash-forward hook)...');
  const audioAbs = p.audioAbs;
  await fs.mkdir(audioAbs, { recursive: true });
  for (const f of ['bed.wav', 'sfx.wav', 'music.wav']) {
    try {
      await fs.copyFile(path.join(p.outDir, 'audio', f), path.join(audioAbs, f));
    } catch {
      /* optional */
    }
  }
  const serve = await createBundle();
  const studio = await loadStudio(ROOT);
  const raw = path.join(p.outDir, 'video.b.raw.mp4');
  await renderReel({ serveUrl: serve, props: { storyboard: sb, audioDir: p.audioRel, hasMusic: true, mix: p.mix, tagline: studio.tagline || null }, outputLocation: raw, quality: opts.quality });
  await loadnormB(raw, path.join(p.outDir, 'video.b.mp4'));
  await fs.rm(raw, { force: true });
  await fs.rm(audioAbs, { recursive: true, force: true });
  opts.log(`Variant B: ${path.relative(ROOT, path.join(p.outDir, 'video.b.mp4'))}`);
  void serveUrl;
}

async function loadnormB(input: string, output: string): Promise<void> {
  const { loudnormAndFaststart } = await import('../audio/post');
  await loudnormAndFaststart(input, output);
}

/** Posting extras: a cover frame and a version without the song (bed + key clicks only). */
async function postExtras(p: Prepared, serveUrl: string, manifest: Manifest, log: (m: string) => void): Promise<void> {
  const sb = p.gen.storyboard;
  const timeline = computeTimeline(sb, VIDEO.fps);
  const last = timeline.scenes[timeline.scenes.length - 1]!;
  const studio = await loadStudio(ROOT);
  const inputProps = { storyboard: sb, audioDir: null, hasMusic: false, tagline: studio.tagline || null } as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: 'Reel', inputProps, ...BROWSER });
  const cover = path.join(p.outDir, 'cover.jpg');
  await renderStill({ composition, serveUrl, inputProps, frame: last.from + Math.floor(last.durationInFrames * 0.45), output: cover, imageFormat: 'jpeg', jpegQuality: 92, overwrite: true, ...BROWSER });
  log(`Cover: ${path.relative(ROOT, cover)}`);

  const video = path.join(ROOT, manifest.files.video);
  const nosong = path.join(p.outDir, 'video.nosong.mp4');
  const bed = path.join(ROOT, manifest.files.bed);
  const sfx = path.join(ROOT, manifest.files.sfx);
  const res = await run(ffmpegBin(), ['-hide_banner', '-nostats', '-y', '-i', video, '-i', bed, '-i', sfx, '-filter_complex', '[1]volume=0.8[b];[2]volume=1[s];[b][s]amix=inputs=2:normalize=0,loudnorm=I=-18:TP=-2[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', nosong]);
  if (res.code === 0) log(`No-song version: ${path.relative(ROOT, nosong)} (add the track from the in-app library if the upload gets muted)`);
  else log('Could not write the no-song version.');
}
