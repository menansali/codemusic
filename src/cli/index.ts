type SongOptionsEnding = 'auto' | 'card' | 'loop' | 'crt' | 'save';
import { Command } from 'commander';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { produce, produceBatch, produceSong, OUTPUT_ROOT } from './pipeline';
import { readManifests, storyboardSummary } from '../render/manifest';
import { StrictSchema } from '../schema/storyboard';
import { computeTimeline } from '../schema/timeline';
import { VIDEO } from '../lib/renderSettings';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  /* no .env, fine */
}

const log = (msg: string) => console.log(msg);
const brandFromEnv = () => (process.env.BRAND_NAME && process.env.BRAND_NAME.trim() ? process.env.BRAND_NAME.trim() : null);

const program = new Command();
program.name('mezzanine-studio').description('Automated cinematic code-editor reel production');

const topicOpts = (cmd: Command) =>
  cmd
    .option('-s, --seed <n>', 'random seed (integer) for reproducible output', (v) => Number.parseInt(v, 10))
    .option('-d, --duration <sec>', 'target duration in seconds (25-35)', (v) => Number.parseFloat(v), 30)
    .option('--draft', 'faster, lower-quality encode for previews', false)
    .option('--dry-run', 'generate storyboard and audio only, skip the render', false)
    .option('--fallback', 'skip Claude and use the offline storyboard library', false)
    .option('--brand <text>', 'brand mark text (overrides BRAND_NAME)');

topicOpts(program.command('generate').description('Generate one video from a topic'))
  .requiredOption('-t, --topic <text>', 'creative topic, e.g. "summer nostalgia"')
  .action(async (o) => {
    const manifest = await produce({
      topic: o.topic,
      seed: o.seed,
      targetDuration: o.duration,
      brand: o.brand ?? brandFromEnv(),
      forceFallback: o.fallback,
      quality: o.draft ? 'draft' : 'final',
      dryRun: o.dryRun,
      log,
    });
    if (manifest) {
      log(`\nDone: ${manifest.files.video}`);
      if (!manifest.validation.ok) process.exitCode = 2;
    }
  });

topicOpts(program.command('batch').description('Generate several distinct videos'))
  .requiredOption('-c, --count <n>', 'number of videos', (v) => Number.parseInt(v, 10))
  .option('-t, --topic <text>', 'topic shared by the batch', 'summer nostalgia')
  .action(async (o) => {
    const manifests = await produceBatch(o.count, {
      topic: o.topic,
      seed: o.seed,
      targetDuration: o.duration,
      brand: o.brand ?? brandFromEnv(),
      forceFallback: o.fallback,
      quality: o.draft ? 'draft' : 'final',
      dryRun: o.dryRun,
      log,
    });
    log(`\nBatch complete: ${manifests.length} video(s).`);
    for (const m of manifests) log(`- ${m.files.video}${m.validation.ok ? '' : '  (VALIDATION FAILED)'}`);
    if (manifests.some((m) => !m.validation.ok)) process.exitCode = 2;
  });

program
  .command('song')
  .description('Lyric-as-code reel cut to a section of a song')
  .requiredOption('-m, --music <file>', 'audio file (mp3, wav, m4a...)')
  .option('-l, --lyrics <file>', 'synced lyrics in LRC format; typing follows the vocals')
  .option('--story <file>', 'story notes file: one note per line, "@sec" prefix to time it, "!" prefix for the twist')
  .option('--start <sec>', 'song time where the reel starts (default: hook line or loudest section)', (v) => Number.parseFloat(v))
  .option('--hook <phrase>', 'lyric phrase to start on (used when --start is omitted)')
  .option('--bpm <n>', 'override detected tempo', (v) => Number.parseFloat(v))
  .option('-n, --names <a,b>', 'cursor names, comma separated (e.g. the artists)', 'you')
  .option('--title <text>', 'song title', 'untitled')
  .option('--artist <text>', 'artist name', 'unknown')
  .option('-d, --duration <sec>', 'reel length in seconds (25-35)', (v) => Number.parseFloat(v), 30)
  .option('-s, --seed <n>', 'random seed', (v) => Number.parseInt(v, 10))
  .option('--draft', 'faster, lower-quality encode', false)
  .option('--dry-run', 'build storyboard and audio only', false)
  .option('--brand <text>', 'brand mark text (overrides BRAND_NAME)')
  .option('--hero <kind>', 'hero set piece: tape | player | horizon | none | auto')
  .option('--vibe <id>', 'look: gece | arabesk | drill | ask | terminal | whatsapp | mono | auto')
  .option('--ending <kind>', 'card | loop | crt (screen power-off) | save (saved toast, window closes) | auto (by vibe)')
  .option('--variants <n>', '2 = also render variant B with the flash-forward hook', (v) => Number.parseInt(v, 10), 1)
  .option('--episode <n>', 'episode number for the #tag (default: next number)', (v) => Number.parseInt(v, 10))
  .option('--no-claude', 'use the built-in lyric converter even when an API key is set')
  .option('--signature <kind>', 'one effect for the song: auto | none | yinyang | mirror | loop | retro | light', 'auto')
  .action(async (o) => {
    const manifest = await produceSong({
      signature: o.signature,
      hero: o.hero,
      vibe: o.vibe,
      ending: o.ending as SongOptionsEnding | undefined,
      variants: o.variants,
      episode: o.episode,
      claude: o.claude,
      music: path.resolve(o.music),
      lyrics: o.lyrics ? path.resolve(o.lyrics) : undefined,
      story: o.story ? path.resolve(o.story) : undefined,
      start: o.start,
      hook: o.hook,
      bpm: o.bpm,
      names: String(o.names).split(',').map((s: string) => s.trim()).filter(Boolean).slice(0, 2),
      title: o.title,
      artist: o.artist,
      seconds: o.duration,
      seed: o.seed,
      brand: o.brand ?? brandFromEnv(),
      quality: o.draft ? 'draft' : 'final',
      dryRun: o.dryRun,
      log,
    });
    if (manifest) {
      log(`\nDone: ${manifest.files.video}`);
      if (!manifest.validation.ok) process.exitCode = 2;
    }
  });

program
  .command('songs')
  .description('Render several song reels from a JSON file (an array of song command options)')
  .requiredOption('-f, --file <json>', 'e.g. songs.json')
  .option('--draft', 'faster, lower-quality encode', false)
  .action(async (o) => {
    const list = JSON.parse(await fs.readFile(path.resolve(o.file), 'utf8')) as Record<string, unknown>[];
    const base = path.dirname(path.resolve(o.file));
    const done: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      const rel = (k: string) => (typeof e[k] === 'string' ? path.resolve(base, e[k] as string) : undefined);
      log(`\n=== Song ${i + 1} of ${list.length}: ${String(e.artist ?? '')} - ${String(e.title ?? '')} ===`);
      const m = await produceSong({
        music: rel('music')!,
        lyrics: rel('lyrics'),
        story: rel('story'),
        start: typeof e.start === 'number' ? e.start : undefined,
        hook: typeof e.hook === 'string' ? e.hook : undefined,
        bpm: typeof e.bpm === 'number' ? e.bpm : undefined,
        names: Array.isArray(e.names) ? (e.names as string[]) : [String(e.artist ?? 'you')],
        title: String(e.title ?? 'untitled'),
        artist: String(e.artist ?? 'unknown'),
        seconds: typeof e.duration === 'number' ? e.duration : 30,
        hero: typeof e.hero === 'string' ? e.hero : undefined,
        vibe: typeof e.vibe === 'string' ? e.vibe : undefined,
        ending: typeof e.ending === 'string' ? (e.ending as SongOptionsEnding) : undefined,
        variants: typeof e.variants === 'number' ? e.variants : 1,
        brand: brandFromEnv(),
        quality: o.draft ? 'draft' : 'final',
        log,
      });
      if (m) done.push(m.files.video);
    }
    log(`\nRendered ${done.length} song reel(s):`);
    for (const d of done) log(`- ${d}`);
  });

program
  .command('list')
  .description('List generated videos')
  .action(async () => {
    const manifests = await readManifests(OUTPUT_ROOT);
    if (manifests.length === 0) return log('No videos yet. Run: npm run generate -- --topic "summer nostalgia"');
    const rows = manifests.map((m) => ({
      id: m.id,
      title: m.title,
      topic: m.topic,
      generator: m.generator,
      seed: m.seed,
      duration: `${m.durationSec.toFixed(1)}s`,
      size: `${(m.probe.sizeBytes / 1e6).toFixed(1)} MB`,
      valid: m.validation.ok ? 'yes' : 'NO',
      created: m.createdAt.slice(0, 16).replace('T', ' '),
    }));
    console.table(rows);
  });

program
  .command('preview')
  .description('Print the scene configuration of a generated video and render one still per scene')
  .requiredOption('-i, --id <id>', 'output id (folder name under output/)')
  .option('--no-stills', 'skip rendering stills')
  .action(async (o) => {
    const dir = path.join(OUTPUT_ROOT, o.id);
    const sb = StrictSchema.parse(JSON.parse(await fs.readFile(path.join(dir, 'storyboard.json'), 'utf8')));
    const timeline = computeTimeline(sb, VIDEO.fps);
    log(`${sb.title}  (topic: ${sb.topic}, seed: ${sb.seed})\n${sb.concept}\n`);
    log('Lines:');
    for (const l of sb.lines) log(`  ${l}`);
    log('\nScenes:');
    log(storyboardSummary(sb));
    log('\nTimeline:');
    for (const t of timeline.scenes) log(`  #${t.index + 1} ${t.type.padEnd(10)} frames ${String(t.from).padStart(4)}-${String(t.from + t.durationInFrames - 1).padStart(4)}${t.typing ? `  types "${t.typing.text}"` : ''}`);
    log(`  total ${timeline.totalFrames} frames = ${(timeline.totalFrames / VIDEO.fps).toFixed(2)}s, ${timeline.cuts.length} cuts, ${timeline.typingFrames.length} key clicks`);
    if (o.stills) {
      const { createBundle, BROWSER } = await import('../render/render');
      const { renderStill, selectComposition } = await import('@remotion/renderer');
      const stillsDir = path.join(dir, 'stills');
      await fs.mkdir(stillsDir, { recursive: true });
      log('\nRendering stills...');
      const serveUrl = await createBundle();
      const inputProps = { storyboard: sb, audioDir: null, hasMusic: false };
      const composition = await selectComposition({ serveUrl, id: 'Reel', inputProps, ...BROWSER });
      for (const t of timeline.scenes) {
        const frame = t.from + Math.floor(t.durationInFrames * 0.6);
        const out = path.join(stillsDir, `scene-${String(t.index + 1).padStart(2, '0')}-${t.type}.png`);
        await renderStill({ composition, serveUrl, inputProps, frame, output: out, imageFormat: 'png', overwrite: true, ...BROWSER });
        log(`  ${path.relative(process.cwd(), out)}`);
      }
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
