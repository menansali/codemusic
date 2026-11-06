import { spawn, type ChildProcess } from 'node:child_process';
import { createReadStream, promises as fs } from 'node:fs';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import path from 'node:path';

/**
 * Instagram fetches the video from a public URL. Instead of uploading to a host, the dashboard opens a
 * temporary Cloudflare quick tunnel to a separate tiny server that serves exactly the files of one post,
 * under a random path, and nothing else (the dashboard itself is never exposed). Closed after publishing.
 */
export type Share = { urls: Record<string, string>; close: () => Promise<void> };

const TYPES: Record<string, string> = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

export async function shareFiles(files: Record<string, string>, log: (m: string) => void): Promise<Share> {
  const token = randomBytes(18).toString('hex');
  const routes = new Map<string, string>();
  for (const [name, file] of Object.entries(files)) routes.set(`/${token}/${name}${path.extname(file)}`, file);

  const server = http.createServer(async (req, res) => {
    const url = (req.url ?? '').split('?')[0]!;
    if (url === `/${token}/ping`) {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    const file = routes.get(url);
    if (!file || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404).end();
      return;
    }
    const st = await fs.stat(file);
    const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
    const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes' });
      if (req.method === 'HEAD') return void res.end();
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes' });
    if (req.method === 'HEAD') return void res.end();
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as { port: number }).port;

  const bin = process.env.CLOUDFLARED_PATH || 'cloudflared';
  let proc: ChildProcess;
  try {
    proc = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    server.close();
    throw new Error('cloudflared is not installed. Run: brew install cloudflared');
  }
  const close = async () => {
    proc.kill('SIGTERM');
    await new Promise<void>((ok) => server.close(() => ok()));
  };
  const base = await new Promise<string>((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('Timed out opening the temporary link (cloudflared). Check your internet connection.')), 45000);
    // The URL is printed before the edge knows it; wait for the first registered connection too.
    let found: string | null = null;
    let registered = false;
    const onData = (b: Buffer) => {
      const text = b.toString();
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) found = m[0];
      if (/Registered tunnel connection/.test(text)) registered = true;
      if (found && registered) {
        clearTimeout(timer);
        ok(found);
      }
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.on('error', () => {
      clearTimeout(timer);
      fail(new Error('cloudflared is not installed. Run: brew install cloudflared'));
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      fail(new Error(`cloudflared exited (${code}) before the link was ready.`));
    });
  }).catch(async (e) => {
    await close();
    throw e;
  });
  // The hostname takes a few seconds to exist. Ask a public resolver first: asking the Mac's own resolver
  // too early caches "not found" for a while and the self-check would fail even though Instagram can reach it.
  const deadline = Date.now() + 90000;
  const pub = new Resolver();
  pub.setServers(['1.1.1.1', '8.8.8.8']);
  const host = new URL(base).hostname;
  for (;;) {
    const ips = await pub.resolve4(host).catch(() => [] as string[]);
    if (ips.length) break;
    if (Date.now() > deadline) {
      await close();
      throw new Error('The temporary link never became reachable.');
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  for (;;) {
    try {
      const r = await fetch(`${base}/${token}/ping`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) break;
    } catch {
      /* not yet */
    }
    if (Date.now() > deadline) {
      await close();
      throw new Error('The temporary link never became reachable.');
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  log('Temporary link open.');
  const urls: Record<string, string> = {};
  for (const [name, file] of Object.entries(files)) urls[name] = `${base}/${token}/${name}${path.extname(file)}`;
  return { urls, close };
}
