import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Post queue state per rendered reel, kept in data/posts.json. Reels themselves live in output/<id>/. */
export type PostStatus = 'draft' | 'approved' | 'scheduled' | 'publishing' | 'posted' | 'failed';
export type Variant = 'a' | 'b' | 'nosong';
export type Post = {
  status: PostStatus;
  variant: Variant;
  caption: string | null;
  shareToFeed: boolean;
  scheduledAt: string | null;
  postedAt: string | null;
  mediaId: string | null;
  permalink: string | null;
  error: string | null;
  step: string | null;
  insights: Record<string, number> | null;
  insightsAt: string | null;
  /** Hidden from the queue (files stay in output/). */
  archived: boolean;
};

const FILE = path.join(process.cwd(), 'data', 'posts.json');
let cache: Record<string, Post> | null = null;
let writing: Promise<void> = Promise.resolve();

export const blankPost = (): Post => ({
  status: 'draft', variant: 'a', caption: null, shareToFeed: true, scheduledAt: null, postedAt: null,
  mediaId: null, permalink: null, error: null, step: null, insights: null, insightsAt: null, archived: false,
});

export async function allPosts(): Promise<Record<string, Post>> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(FILE, 'utf8')) as Record<string, Post>;
  } catch {
    cache = {};
  }
  // A crash mid-publish must not leave a post stuck; it goes back to failed so it can be retried.
  for (const p of Object.values(cache)) if (p.status === 'publishing') Object.assign(p, { status: 'failed', error: 'Interrupted while publishing (dashboard was closed). Check Instagram before retrying.' });
  return cache;
}

export async function getPost(id: string): Promise<Post> {
  const all = await allPosts();
  return { ...blankPost(), ...(all[id] ?? {}) };
}

export async function updatePost(id: string, patch: Partial<Post>): Promise<Post> {
  const all = await allPosts();
  const next = { ...blankPost(), ...(all[id] ?? {}), ...patch };
  all[id] = next;
  writing = writing.then(async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(all, null, 2));
    await fs.rename(tmp, FILE);
  });
  await writing;
  return next;
}
