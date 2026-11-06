/**
 * Instagram API with Instagram Login (graph.instagram.com): no Facebook Page needed.
 * Reels flow: create a REELS container from a public video_url -> poll status_code -> media_publish.
 * Token and user id come from .env (IG_ACCESS_TOKEN, IG_USER_ID); never logged, never sent anywhere else.
 */
const HOST = 'https://graph.instagram.com';
const version = () => process.env.IG_API_VERSION || 'v27.0';

export class IgError extends Error {
  constructor(message: string, readonly code: number | null = null) {
    super(message);
  }
}

function creds() {
  const token = process.env.IG_ACCESS_TOKEN?.trim();
  const user = process.env.IG_USER_ID?.trim();
  if (!token) throw new IgError('Instagram is not connected yet. Open Settings and paste your access token.');
  return { token, user: user || null };
}

async function call<T>(method: 'GET' | 'POST', pathname: string, params: Record<string, string>, token: string): Promise<T> {
  const url = new URL(pathname.startsWith('http') ? pathname : `${HOST}/${version()}/${pathname}`);
  const body = new URLSearchParams({ ...params, access_token: token });
  let res: Response;
  try {
    res = method === 'GET' ? await fetch(`${url}?${body}`, { signal: AbortSignal.timeout(30000) }) : await fetch(url, { method, body, signal: AbortSignal.timeout(60000) });
  } catch (e) {
    throw new IgError(`Could not reach Instagram (${(e as Error).message}).`);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_user_msg?: string } } & T;
  if (!res.ok || json.error) {
    const err = json.error ?? {};
    // 190 = bad or expired token; say what to do instead of Meta's internal wording.
    if (err.code === 190 || /decrypt|session has expired|invalid oauth/i.test(err.message ?? '')) throw new IgError('Instagram did not accept the access token (wrong, expired or revoked). Generate a new one in your Meta app and paste it in Settings.', 190);
    throw new IgError(err.error_user_msg || err.message || `Instagram returned HTTP ${res.status}`, err.code ?? res.status);
  }
  return json;
}

export type Account = { userId: string; username: string; accountType: string | null; picture: string | null };

export async function account(tokenOverride?: string): Promise<Account> {
  const token = tokenOverride ?? creds().token;
  const me = await call<{ user_id?: string; id?: string; username: string; account_type?: string; profile_picture_url?: string }>('GET', 'me', { fields: 'user_id,username,account_type,profile_picture_url' }, token);
  return { userId: String(me.user_id ?? me.id), username: me.username, accountType: me.account_type ?? null, picture: me.profile_picture_url ?? null };
}

/** Long-lived tokens last 60 days; refreshing (allowed once the token is 24 h old) gives another 60. */
export async function refreshToken(): Promise<{ token: string; expiresIn: number }> {
  const { token } = creds();
  const r = await call<{ access_token: string; expires_in: number }>('GET', `${HOST}/refresh_access_token`, { grant_type: 'ig_refresh_token' }, token);
  return { token: r.access_token, expiresIn: r.expires_in };
}

export async function publishLimit(): Promise<{ used: number; total: number } | null> {
  const { token, user } = creds();
  if (!user) return null;
  const r = await call<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>('GET', `${user}/content_publishing_limit`, { fields: 'quota_usage,config' }, token);
  const d = r.data?.[0];
  return d ? { used: d.quota_usage ?? 0, total: d.config?.quota_total ?? 100 } : null;
}

export async function publishReel(
  input: { videoUrl: string; coverUrl: string | null; caption: string; shareToFeed: boolean },
  step: (s: string) => Promise<void>,
): Promise<{ mediaId: string; permalink: string | null }> {
  const { token, user } = creds();
  if (!user) throw new IgError('Instagram user id missing. Open Settings and press "Check connection".');
  await step('Creating the reel on Instagram');
  const params: Record<string, string> = { media_type: 'REELS', video_url: input.videoUrl, caption: input.caption, share_to_feed: String(input.shareToFeed) };
  if (input.coverUrl) params.cover_url = input.coverUrl;
  const container = await call<{ id: string }>('POST', `${user}/media`, params, token);

  // Instagram downloads and processes the video; usually under a minute for a 30 s reel.
  const deadline = Date.now() + 8 * 60 * 1000;
  let status = 'IN_PROGRESS';
  while (status === 'IN_PROGRESS') {
    await new Promise((r) => setTimeout(r, 12000));
    const s = await call<{ status_code: string; status?: string }>('GET', container.id, { fields: 'status_code,status' }, token);
    status = s.status_code;
    await step(`Instagram is processing the video (${status.toLowerCase().replace('_', ' ')})`);
    if (status === 'ERROR' || status === 'EXPIRED') throw new IgError(`Instagram could not process the video: ${s.status ?? status}`);
    if (Date.now() > deadline) throw new IgError('Instagram took too long to process the video. Try again later.');
  }
  await step('Publishing');
  const pub = await call<{ id: string }>('POST', `${user}/media_publish`, { creation_id: container.id }, token);
  let permalink: string | null = null;
  try {
    permalink = (await call<{ permalink?: string }>('GET', pub.id, { fields: 'permalink' }, token)).permalink ?? null;
  } catch {
    /* the post is live even if this lookup fails */
  }
  return { mediaId: pub.id, permalink };
}

/** Reel stats. Needs the instagram_business_manage_insights permission; metric names follow Meta's current set. */
export async function insights(mediaId: string): Promise<Record<string, number>> {
  const { token } = creds();
  const sets = ['views,reach,likes,comments,shares,saved,total_interactions', 'reach,likes,comments,shares,saved'];
  let last: unknown = null;
  for (const metric of sets) {
    try {
      const r = await call<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>('GET', `${mediaId}/insights`, { metric }, token);
      const out: Record<string, number> = {};
      for (const d of r.data) out[d.name] = d.total_value?.value ?? d.values?.[0]?.value ?? 0;
      return out;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
