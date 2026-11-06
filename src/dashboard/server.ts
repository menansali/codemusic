import { execFile } from 'node:child_process';
import { createReadStream, existsSync, promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { readEnv, writeEnv } from './env';
import { allPosts, getPost, updatePost, type Post, type Variant } from './store';
import { busy, getJob, listJobs, runJob } from './jobs';
import { account, insights, IgError, publishLimit, publishReel, refreshToken } from './instagram';
import { shareFiles } from './tunnel';

/**
 * codemusic dashboard: make reels, review them, approve, schedule and post to Instagram.
 * Local only: binds to 127.0.0.1, rejects foreign Host headers (DNS rebinding) and cross-site writes.
 */
const ROOT = process.cwd();
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* no .env yet */
}
const PORT = Number(process.env.DASHBOARD_PORT || 4400);
const OUTPUT = path.join(ROOT, 'output');
const UI = path.join(ROOT, 'src', 'dashboard', 'ui');
const MUSIC = path.join(ROOT, 'assets', 'music');
const LYRICS = path.join(ROOT, 'assets', 'lyrics');
const STORIES = path.join(ROOT, 'assets', 'stories');
const ALIGN_PY = path.join(ROOT, 'tools', 'align', '.venv', 'bin', 'python');
const run = promisify(execFile);

const slug = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'song';
const safeId = (id: string) => /^[a-z0-9][a-z0-9-]{0,120}$/.test(id);
const inside = (dir: string, file: string) => {
  const p = path.resolve(dir, file);
  return p.startsWith(dir + path.sep) ? p : null;
};

// ---------- reels ----------

type Reel = {
  id: string;
  title: string;
  artist: string;
  vibe: string | null;
  episode: number | null;
  createdAt: string;
  files: { a: boolean; b: boolean; nosong: boolean; cover: boolean };
  caption: string;
  sizeMb: number | null;
  post: Post;
};

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function loadReel(id: string): Promise<Reel | null> {
  const dir = path.join(OUTPUT, id);
  const manifest = await readJson<{ title?: string; createdAt?: string; probe?: { sizeBytes?: number } }>(path.join(dir, 'manifest.json'));
  if (!manifest) return null;
  const sb = await readJson<{ title?: string; song?: { title?: string; artist?: string }; vibe?: string; episode?: number }>(path.join(dir, 'storyboard.json'));
  let caption = '';
  try {
    caption = await fs.readFile(path.join(dir, 'caption.txt'), 'utf8');
  } catch {
    caption = '';
  }
  return {
    id,
    title: sb?.song?.title ?? manifest.title ?? id,
    artist: sb?.song?.artist ?? '',
    vibe: sb?.vibe ?? null,
    episode: sb?.episode ?? null,
    createdAt: manifest.createdAt ?? '',
    files: {
      a: existsSync(path.join(dir, 'video.mp4')),
      b: existsSync(path.join(dir, 'video.b.mp4')),
      nosong: existsSync(path.join(dir, 'video.nosong.mp4')),
      cover: existsSync(path.join(dir, 'cover.jpg')),
    },
    caption: caption.trimEnd(),
    sizeMb: manifest.probe?.sizeBytes ? Math.round((manifest.probe.sizeBytes / 1e6) * 10) / 10 : null,
    post: await getPost(id),
  };
}

async function listReels(): Promise<Reel[]> {
  let ids: string[] = [];
  try {
    ids = (await fs.readdir(OUTPUT, { withFileTypes: true })).filter((d) => d.isDirectory() && safeId(d.name)).map((d) => d.name);
  } catch {
    ids = [];
  }
  const reels = (await Promise.all(ids.map(loadReel))).filter((r): r is Reel => r !== null && r.files.a);
  return reels.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const videoFile = (id: string, v: Variant) => path.join(OUTPUT, id, v === 'b' ? 'video.b.mp4' : v === 'nosong' ? 'video.nosong.mp4' : 'video.mp4');

// ---------- publishing ----------

const publishing = new Set<string>();

async function publish(id: string): Promise<void> {
  if (publishing.has(id)) return;
  publishing.add(id);
  const step = async (s: string) => void (await updatePost(id, { step: s }));
  let share: Awaited<ReturnType<typeof shareFiles>> | null = null;
  try {
    const reel = await loadReel(id);
    if (!reel) throw new Error('Reel not found.');
    const post = reel.post;
    await updatePost(id, { status: 'publishing', error: null, step: 'Preparing the video' });
    const src = videoFile(id, post.variant);
    if (!existsSync(src)) throw new Error(`The ${post.variant.toUpperCase()} video is missing.`);
    // Instagram's Reels spec: AAC up to 128 kbps / 48 kHz, moov atom first, no edit lists. Video stream is copied.
    const dir = path.join(ROOT, 'data', 'publish', id);
    await fs.mkdir(dir, { recursive: true });
    const out = path.join(dir, 'video.mp4');
    await run(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-y', '-i', src, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', '-use_editlist', '0', out]);
    const files: Record<string, string> = { video: out };
    const cover = path.join(OUTPUT, id, 'cover.jpg');
    if (existsSync(cover)) files.cover = cover;
    await step('Opening a temporary link for Instagram');
    share = await shareFiles(files, () => undefined);
    const caption = (post.caption ?? reel.caption).slice(0, 2200);
    const res = await publishReel({ videoUrl: share.urls.video!, coverUrl: share.urls.cover ?? null, caption, shareToFeed: post.shareToFeed }, step);
    await updatePost(id, { status: 'posted', postedAt: new Date().toISOString(), mediaId: res.mediaId, permalink: res.permalink, step: null, error: null, scheduledAt: null });
  } catch (e) {
    await updatePost(id, { status: 'failed', error: (e as Error).message, step: null });
  } finally {
    if (share) await share.close().catch(() => undefined);
    publishing.delete(id);
  }
}

// Scheduler: every 30 s, publish what is due (one at a time). The Mac must be awake and the dashboard running.
let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const all = await allPosts();
    const now = Date.now();
    const due = Object.entries(all)
      .filter(([, p]) => p.status === 'scheduled' && p.scheduledAt && Date.parse(p.scheduledAt) <= now)
      .sort((a, b) => a[1].scheduledAt!.localeCompare(b[1].scheduledAt!));
    for (const [id] of due) await publish(id);
    await maybeRefreshToken();
  } finally {
    ticking = false;
  }
}

async function maybeRefreshToken() {
  const env = await readEnv();
  const saved = Date.parse(env.IG_TOKEN_SAVED_AT ?? '');
  if (!env.IG_ACCESS_TOKEN || !Number.isFinite(saved)) return;
  // Refresh every ~20 days, well inside the 60-day lifetime.
  if (Date.now() - saved < 20 * 864e5) return;
  try {
    const r = await refreshToken();
    await writeEnv({ IG_ACCESS_TOKEN: r.token, IG_TOKEN_SAVED_AT: new Date().toISOString(), IG_TOKEN_EXPIRES_AT: new Date(Date.now() + r.expiresIn * 1000).toISOString() });
  } catch {
    /* shown in Settings as an expiring token */
  }
}

// ---------- jobs ----------

function startAlign(music: string, lyricsTxt: string, lrc: string) {
  return runJob('align', `Timing lyrics: ${path.basename(lrc)}`, ALIGN_PY, ['-I', path.join(ROOT, 'tools', 'align', 'align.py'), music, lyricsTxt, lrc, process.env.ALIGN_MODEL || 'medium'], (line, job) => {
    const m = line.match(/^progress ([\d.]+)$/);
    if (m) job.progress = Number(m[1]);
    else if (line.startsWith('{')) job.result = { ...JSON.parse(line), lrc: path.relative(ROOT, lrc) };
  }, async (code, job) => {
    if (code !== 0) throw new Error('Lyric timing failed. Is the aligner installed? Run: npm run setup:align');
    job.progress = 1;
  });
}

type RenderInput = { music: string; lrc: string; story: string; hook: string; names: string; title: string; artist: string; vibe: string; signature: string; episode: string; variants: boolean };
const SIGNATURE_IDS = ['auto', 'none', 'yinyang', 'mirror', 'loop', 'retro', 'light'];

async function startRender(input: RenderInput) {
  const base = slug(`${input.artist}-${input.title}`);
  const args = ['tsx', 'src/cli/index.ts', 'song', '--music', input.music, '--title', input.title, '--artist', input.artist, '--names', input.names || slug(input.artist)];
  if (input.lrc) args.push('--lyrics', input.lrc);
  if (input.story.trim()) {
    const file = path.join(STORIES, `${base}.txt`);
    await fs.mkdir(STORIES, { recursive: true });
    await fs.writeFile(file, input.story.trim() + '\n');
    args.push('--story', file);
  }
  if (input.hook.trim()) args.push('--hook', input.hook.trim());
  if (input.vibe && input.vibe !== 'auto') args.push('--vibe', input.vibe);
  if (SIGNATURE_IDS.includes(input.signature) && input.signature !== 'auto') args.push('--signature', input.signature);
  if (input.episode.trim()) args.push('--episode', input.episode.trim());
  if (input.variants) args.push('--variants', '2');
  return runJob('render', `Rendering ${input.artist} – ${input.title}`, 'npx', args, (line, job) => {
    const m = line.match(/^Rendering (\d+)%/);
    if (m) job.progress = Number(m[1]) / 100;
    const done = line.match(/^Done: output\/([^/]+)\/video\.mp4/);
    if (done) job.result = { reelId: done[1] };
  }, async (code, job) => {
    if (code !== 0) throw new Error('Render failed. See the log above.');
    const id = job.result?.reelId as string | undefined;
    if (id) await updatePost(id, { status: 'draft' });
  });
}

// ---------- http ----------

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function send(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(body));
}

async function serveFile(req: http.IncomingMessage, res: http.ServerResponse, file: string) {
  let st;
  try {
    st = await fs.stat(file);
  } catch {
    res.writeHead(404).end();
    return;
  }
  const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes' });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
  createReadStream(file).pipe(res);
}

async function body<T>(req: http.IncomingMessage, limit = 2e6): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error('Request too large');
    chunks.push(c as Buffer);
  }
  return (chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}) as T;
}

async function settings() {
  const env = await readEnv();
  const connected = !!env.IG_ACCESS_TOKEN;
  let acct: Awaited<ReturnType<typeof account>> | null = null;
  let error: string | null = null;
  let limit: Awaited<ReturnType<typeof publishLimit>> = null;
  if (connected) {
    try {
      acct = await account();
      limit = await publishLimit().catch(() => null);
    } catch (e) {
      error = (e as Error).message;
    }
  }
  let cloudflared = false;
  try {
    await run(process.env.CLOUDFLARED_PATH || 'cloudflared', ['--version']);
    cloudflared = true;
  } catch {
    cloudflared = false;
  }
  return {
    connected,
    account: acct,
    error,
    limit,
    tokenSavedAt: env.IG_TOKEN_SAVED_AT || null,
    tokenExpiresAt: env.IG_TOKEN_EXPIRES_AT || null,
    apiVersion: process.env.IG_API_VERSION || 'v27.0',
    cloudflared,
    aligner: existsSync(ALIGN_PY),
    studio: (await readJson<{ name?: string }>(path.join(ROOT, 'studio.json')))?.name ?? null,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const host = (req.headers.host ?? '').toLowerCase();
    if (host !== `localhost:${PORT}` && host !== `127.0.0.1:${PORT}`) return void res.writeHead(403).end('Forbidden');
    const url = new URL(req.url ?? '/', `http://${host}`);
    const p = url.pathname;
    const method = req.method ?? 'GET';
    // Writes must come from the dashboard itself: a custom header cannot be sent cross-site without CORS, which we never grant.
    if (method !== 'GET' && method !== 'HEAD' && req.headers['x-meno'] !== '1') return send(res, 403, { error: 'Forbidden' });

    if (method === 'GET' && p === '/favicon.ico') return void res.writeHead(204).end();
    if (method === 'GET' && (p === '/' || p === '/index.html')) return serveFile(req, res, path.join(UI, 'index.html'));
    if (method === 'GET' && /^\/(app\.js|style\.css)$/.test(p)) return serveFile(req, res, path.join(UI, p.slice(1)));

    if (method === 'GET' && /^\/fonts\/JetBrainsMono-(Regular|Bold)\.woff2$/.test(p)) return serveFile(req, res, path.join(ROOT, 'public', p.slice(1)));
    let m = p.match(/^\/media\/([a-z0-9-]+)\/(video\.mp4|video\.b\.mp4|video\.nosong\.mp4|cover\.jpg)$/);
    if (method === 'GET' && m && safeId(m[1]!)) return serveFile(req, res, path.join(OUTPUT, m[1]!, m[2]!));

    if (method === 'GET' && p === '/api/reels') {
      const reels = await listReels();
      return send(res, 200, { reels: url.searchParams.get('archived') ? reels : reels.filter((r) => !r.post.archived) });
    }
    m = p.match(/^\/api\/reels\/([a-z0-9-]+)$/);
    if (m && safeId(m[1]!)) {
      const id = m[1]!;
      if (method === 'GET') return send(res, 200, await loadReel(id));
      if (method === 'POST') {
        const b = await body<Partial<Post> & { action?: string }>(req);
        const cur = await getPost(id);
        if (cur.status === 'publishing') return send(res, 409, { error: 'This reel is being published right now.' });
        const patch: Partial<Post> = {};
        if (typeof b.caption === 'string' || b.caption === null) patch.caption = b.caption;
        if (b.variant === 'a' || b.variant === 'b' || b.variant === 'nosong') patch.variant = b.variant;
        if (typeof b.shareToFeed === 'boolean') patch.shareToFeed = b.shareToFeed;
        if (typeof b.archived === 'boolean') patch.archived = b.archived;
        if (b.action === 'approve') Object.assign(patch, { status: 'approved', error: null });
        if (b.action === 'unapprove') Object.assign(patch, { status: 'draft', scheduledAt: null });
        if (b.action === 'schedule') {
          const t = Date.parse(String(b.scheduledAt ?? ''));
          if (!Number.isFinite(t)) return send(res, 400, { error: 'Pick a date and time.' });
          if (t < Date.now() - 60000) return send(res, 400, { error: 'That time is in the past.' });
          Object.assign(patch, { status: 'scheduled', scheduledAt: new Date(t).toISOString(), error: null });
        }
        if (b.action === 'unschedule') Object.assign(patch, { status: 'approved', scheduledAt: null });
        if (cur.status === 'posted' && (b.action === 'approve' || b.action === 'schedule')) return send(res, 409, { error: 'Already posted. Archive it or make a new reel.' });
        await updatePost(id, patch);
        return send(res, 200, await loadReel(id));
      }
    }
    m = p.match(/^\/api\/reels\/([a-z0-9-]+)\/publish$/);
    if (method === 'POST' && m && safeId(m[1]!)) {
      const id = m[1]!;
      const cur = await getPost(id);
      if (cur.status === 'posted') return send(res, 409, { error: 'Already posted.' });
      if (cur.status !== 'approved' && cur.status !== 'scheduled' && cur.status !== 'failed') return send(res, 409, { error: 'Approve the reel first.' });
      void publish(id);
      return send(res, 202, { ok: true });
    }
    m = p.match(/^\/api\/reels\/([a-z0-9-]+)\/insights$/);
    if (method === 'POST' && m && safeId(m[1]!)) {
      const cur = await getPost(m[1]!);
      if (!cur.mediaId) return send(res, 409, { error: 'Not posted yet.' });
      try {
        await updatePost(m[1]!, { insights: await insights(cur.mediaId), insightsAt: new Date().toISOString() });
      } catch (e) {
        return send(res, 502, { error: (e as Error).message });
      }
      return send(res, 200, await loadReel(m[1]!));
    }

    if (method === 'GET' && p === '/api/settings') return send(res, 200, await settings());
    if (method === 'POST' && p === '/api/settings/token') {
      const b = await body<{ token?: string }>(req);
      const token = (b.token ?? '').trim();
      if (!/^[A-Za-z0-9_\-|.]{20,}$/.test(token)) return send(res, 400, { error: 'That does not look like an access token.' });
      try {
        const acct = await account(token);
        if (acct.accountType && !/BUSINESS|MEDIA_CREATOR|CREATOR/i.test(acct.accountType)) return send(res, 400, { error: `@${acct.username} is a ${acct.accountType} account. Switch it to Professional (Creator or Business) in the Instagram app first.` });
        await writeEnv({ IG_ACCESS_TOKEN: token, IG_USER_ID: acct.userId, IG_TOKEN_SAVED_AT: new Date().toISOString() });
      } catch (e) {
        return send(res, 400, { error: e instanceof IgError ? e.message : 'Could not check the token.' });
      }
      return send(res, 200, await settings());
    }
    if (method === 'POST' && p === '/api/settings/refresh') {
      try {
        const r = await refreshToken();
        await writeEnv({ IG_ACCESS_TOKEN: r.token, IG_TOKEN_SAVED_AT: new Date().toISOString(), IG_TOKEN_EXPIRES_AT: new Date(Date.now() + r.expiresIn * 1000).toISOString() });
      } catch (e) {
        return send(res, 400, { error: (e as Error).message });
      }
      return send(res, 200, await settings());
    }
    if (method === 'POST' && p === '/api/settings/disconnect') {
      await writeEnv({ IG_ACCESS_TOKEN: '', IG_USER_ID: '', IG_TOKEN_SAVED_AT: '', IG_TOKEN_EXPIRES_AT: '' });
      return send(res, 200, await settings());
    }

    if (method === 'GET' && p === '/api/library') {
      const ls = async (dir: string, re: RegExp) => {
        try {
          return (await fs.readdir(dir)).filter((f) => re.test(f)).sort();
        } catch {
          return [];
        }
      };
      return send(res, 200, { music: await ls(MUSIC, /\.(mp3|wav|m4a|aac|flac|ogg)$/i), lyrics: await ls(LYRICS, /\.lrc$/i) });
    }
    if (method === 'POST' && p === '/api/upload') {
      const name = url.searchParams.get('name') ?? 'song.mp3';
      const ext = (path.extname(name).toLowerCase().match(/^\.(mp3|wav|m4a|aac|flac|ogg)$/) ?? ['.mp3'])[0];
      const file = path.join(MUSIC, slug(path.basename(name, path.extname(name))) + ext);
      await fs.mkdir(MUSIC, { recursive: true });
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const c of req) {
        size += (c as Buffer).length;
        if (size > 200e6) return send(res, 413, { error: 'File too large (200 MB max).' });
        chunks.push(c as Buffer);
      }
      await fs.writeFile(file, Buffer.concat(chunks));
      return send(res, 200, { music: path.basename(file) });
    }
    if (p === '/api/lyrics') {
      const name = url.searchParams.get('file') ?? '';
      const file = inside(LYRICS, name);
      if (!file || !file.endsWith('.lrc')) return send(res, 400, { error: 'Bad file name.' });
      if (method === 'GET') return send(res, 200, { text: await fs.readFile(file, 'utf8').catch(() => '') });
      if (method === 'POST') {
        const b = await body<{ text?: string }>(req);
        await fs.mkdir(LYRICS, { recursive: true });
        await fs.writeFile(file, (b.text ?? '').replace(/\r\n/g, '\n'));
        return send(res, 200, { ok: true });
      }
    }
    if (method === 'POST' && p === '/api/align') {
      const b = await body<{ music?: string; lyrics?: string; name?: string }>(req);
      const music = inside(MUSIC, b.music ?? '');
      if (!music || !existsSync(music)) return send(res, 400, { error: 'Pick a song file first.' });
      if (!(b.lyrics ?? '').trim()) return send(res, 400, { error: 'Paste the lyrics first.' });
      if (!existsSync(ALIGN_PY)) return send(res, 400, { error: 'The lyric aligner is not installed. Run: npm run setup:align' });
      if (busy('align')) return send(res, 409, { error: 'Already timing a song. Wait for it to finish.' });
      const base = slug(b.name || path.basename(music, path.extname(music)));
      await fs.mkdir(LYRICS, { recursive: true });
      const txt = path.join(LYRICS, `${base}.txt`);
      await fs.writeFile(txt, b.lyrics!.replace(/\r\n/g, '\n'));
      return send(res, 202, startAlign(music, txt, path.join(LYRICS, `${base}.lrc`)));
    }
    if (method === 'POST' && p === '/api/render') {
      const b = await body<Partial<RenderInput>>(req);
      const music = inside(MUSIC, b.music ?? '');
      if (!music || !existsSync(music)) return send(res, 400, { error: 'Pick a song file first.' });
      const lrc = b.lrc ? inside(LYRICS, b.lrc) : null;
      if (b.lrc && (!lrc || !existsSync(lrc))) return send(res, 400, { error: 'Time the lyrics first.' });
      if (!b.title?.trim() || !b.artist?.trim()) return send(res, 400, { error: 'Title and artist are needed.' });
      if (busy('render')) return send(res, 409, { error: 'A render is already running. One at a time keeps the Mac usable.' });
      const job = await startRender({ music, lrc: lrc ?? '', story: b.story ?? '', hook: b.hook ?? '', names: b.names ?? '', title: b.title.trim(), artist: b.artist.trim(), vibe: b.vibe ?? 'auto', signature: b.signature ?? 'auto', episode: String(b.episode ?? ''), variants: b.variants !== false });
      return send(res, 202, job);
    }
    if (method === 'GET' && p === '/api/jobs') return send(res, 200, { jobs: listJobs().map(({ lines, ...j }) => ({ ...j, last: lines[lines.length - 1] ?? '' })) });
    m = p.match(/^\/api\/jobs\/([a-f0-9]+)$/);
    if (method === 'GET' && m) {
      const job = getJob(m[1]!);
      return job ? send(res, 200, job) : send(res, 404, { error: 'No such job.' });
    }

    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, 500, { error: (e as Error).message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`codemusic dashboard: http://localhost:${PORT}`);
  console.log('Keep this running for scheduled posts (the Mac must be awake).');
});
setInterval(() => void tick(), 30000);
void tick();
