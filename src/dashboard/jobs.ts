import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

/** Long-running work (lyric timing, renders) as child processes with a log the UI can follow. */
export type Job = {
  id: string;
  kind: 'align' | 'render';
  label: string;
  status: 'running' | 'done' | 'failed';
  lines: string[];
  progress: number | null;
  result: Record<string, unknown> | null;
  startedAt: string;
  endedAt: string | null;
};

const jobs = new Map<string, Job>();

export const listJobs = () => [...jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 20);
export const getJob = (id: string) => jobs.get(id) ?? null;
export const busy = (kind: Job['kind']) => [...jobs.values()].some((j) => j.kind === kind && j.status === 'running');

export function runJob(
  kind: Job['kind'],
  label: string,
  cmd: string,
  args: string[],
  onLine: (line: string, job: Job) => void,
  onExit: (code: number, job: Job) => Promise<void>,
): Job {
  const job: Job = { id: randomBytes(6).toString('hex'), kind, label, status: 'running', lines: [], progress: null, result: null, startedAt: new Date().toISOString(), endedAt: null };
  jobs.set(job.id, job);
  const proc = spawn(cmd, args, { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  const feed = (buf: Buffer) => {
    for (const raw of buf.toString().split(/\r?\n|\r/)) {
      const line = raw.replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
      if (!line) continue;
      onLine(line, job);
      if (/^progress [\d.]+$/.test(line)) continue;
      const last = job.lines[job.lines.length - 1] ?? '';
      // Progress lines replace each other instead of flooding the log.
      if (/^Rendering \d+%/.test(line) && /^Rendering \d+%/.test(last)) job.lines[job.lines.length - 1] = line;
      else job.lines.push(line);
      if (job.lines.length > 400) job.lines.splice(0, job.lines.length - 400);
    }
  };
  proc.stdout.on('data', feed);
  proc.stderr.on('data', feed);
  proc.on('error', (e) => {
    job.lines.push(`Could not start: ${e.message}`);
    job.status = 'failed';
    job.endedAt = new Date().toISOString();
  });
  proc.on('close', async (code) => {
    try {
      await onExit(code ?? 1, job);
      job.status = code === 0 ? 'done' : 'failed';
    } catch (e) {
      job.lines.push((e as Error).message);
      job.status = 'failed';
    }
    job.endedAt = new Date().toISOString();
  });
  return job;
}
