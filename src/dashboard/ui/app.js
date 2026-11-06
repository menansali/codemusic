// codemusic dashboard. Plain JS, no build step.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const main = $('#main');

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'x-meno': '1', ...(opts.body && !(opts.body instanceof Blob) ? { 'content-type': 'application/json' } : {}), ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

let toastTimer = null;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), err ? 6000 : 3000);
}

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const num = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString());

const STATUS = {
  draft: { label: 'Needs review', dot: '' },
  approved: { label: 'Approved', dot: 'ok' },
  scheduled: { label: 'Scheduled', dot: 'warn' },
  publishing: { label: 'Posting…', dot: 'live' },
  posted: { label: 'Posted', dot: 'ok' },
  failed: { label: 'Failed', dot: 'err' },
};

const state = { view: 'queue', reels: [], selected: null, settings: null, jobs: [], newReel: { music: '', lrc: '', lyrics: '', alignJob: null, renderJob: null } };

// ---------- routing ----------
function route() {
  state.view = (location.hash.replace('#', '') || 'queue').split('/')[0];
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.view === state.view));
  render();
}
window.addEventListener('hashchange', route);

function render() {
  if (state.view === 'new') return renderNew();
  if (state.view === 'settings') return renderSettings();
  return renderQueue();
}

// ---------- side status ----------
async function loadSettings() {
  try {
    state.settings = await api('/api/settings');
  } catch {
    state.settings = null;
  }
  const s = state.settings;
  const c = $('#conn');
  if (!s || !s.connected) c.innerHTML = '<span class="dot"></span><span>Instagram not connected</span>';
  else if (s.error) c.innerHTML = '<span class="dot err"></span><span>Connection problem</span>';
  else c.innerHTML = `<span class="dot ok"></span><span>@${esc(s.account?.username)}</span>`;
}

// ---------- queue ----------
async function loadReels() {
  const { reels } = await api('/api/reels');
  state.reels = reels;
  const review = reels.filter((r) => r.post.status === 'draft').length;
  $('#count-review').textContent = review ? String(review) : '';
  if (state.selected && !reels.some((r) => r.id === state.selected)) state.selected = null;
  if (!state.selected && reels[0]) state.selected = reels[0].id;
}

function rowHtml(r) {
  const st = STATUS[r.post.status] || STATUS.draft;
  const when = r.post.status === 'scheduled' ? fmtDate(r.post.scheduledAt) : r.post.status === 'posted' ? fmtDate(r.post.postedAt) : '';
  return `<div class="row ${state.selected === r.id ? 'on' : ''}" data-id="${esc(r.id)}" tabindex="0">
    <div class="thumb" style="background-image:url('/media/${esc(r.id)}/cover.jpg')"></div>
    <div>
      <div class="title">${esc(r.title)}${r.artist ? ` <span class="by">· ${esc(r.artist)}</span>` : ''}</div>
      <div class="meta">${[r.episode ? `#${String(r.episode).padStart(3, '0')}` : '', r.vibe || '', r.sizeMb ? `${r.sizeMb} MB` : '', fmtDate(r.createdAt)].filter(Boolean).map(esc).join(' · ')}</div>
    </div>
    <div class="status"><span class="dot ${st.dot}"></span>${st.label}${when ? ` <span class="meta">${esc(when)}</span>` : ''}</div>
  </div>`;
}

function renderQueue() {
  const groups = [
    ['Needs review', state.reels.filter((r) => r.post.status === 'draft' || r.post.status === 'failed')],
    ['Ready to post', state.reels.filter((r) => ['approved', 'scheduled', 'publishing'].includes(r.post.status))],
    ['Posted', state.reels.filter((r) => r.post.status === 'posted')],
  ];
  const list = state.reels.length
    ? groups.filter(([, rs]) => rs.length).map(([label, rs]) => `<div class="group"><div class="label"><span>${label}</span><span class="meta">${rs.length}</span></div><div class="rows">${rs.map(rowHtml).join('')}</div></div>`).join('')
    : `<div class="empty">No reels yet.<br><br><a class="btn" href="#new">Make the first one</a></div>`;
  const sel = state.reels.find((r) => r.id === state.selected);
  main.innerHTML = `<div class="head"><h1>Queue</h1><span class="sub">${state.reels.length} reel${state.reels.length === 1 ? '' : 's'}</span></div>
    <div class="queue"><div>${list}</div><div id="detail">${sel ? detailHtml(sel) : ''}</div></div>`;
  main.querySelectorAll('.row').forEach((el) => {
    const pick = () => {
      state.selected = el.dataset.id;
      renderQueue();
    };
    el.addEventListener('click', pick);
    el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick()));
  });
  if (sel) bindDetail(sel);
}

function captionStats(text) {
  const tags = (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
  return { len: [...text].length, tags };
}

function detailHtml(r) {
  const p = r.post;
  const caption = p.caption ?? r.caption;
  const cs = captionStats(caption);
  const locked = p.status === 'posted' || p.status === 'publishing';
  const v = p.variant;
  const src = v === 'b' ? 'video.b.mp4' : v === 'nosong' ? 'video.nosong.mp4' : 'video.mp4';
  const connected = state.settings?.connected && !state.settings?.error;
  let actions = '';
  if (p.status === 'draft' || p.status === 'failed') {
    actions = `<button class="btn primary" data-act="approve">Approve</button>${p.status === 'failed' && connected ? '<button class="btn" data-act="retry">Retry post</button>' : ''}<button class="btn quiet" data-act="archive">Archive</button>`;
  } else if (p.status === 'approved') {
    actions = `<button class="btn primary" data-act="now" ${connected ? '' : 'disabled'}>Post now</button>
      <input type="datetime-local" id="when" style="width:auto">
      <button class="btn" data-act="schedule">Schedule</button>
      <button class="btn quiet" data-act="unapprove">Back to review</button>`;
  } else if (p.status === 'scheduled') {
    actions = `<span class="status"><span class="dot warn"></span>Posts ${esc(fmtDate(p.scheduledAt))}</span><button class="btn" data-act="now" ${connected ? '' : 'disabled'}>Post now instead</button><button class="btn quiet" data-act="unschedule">Unschedule</button>`;
  } else if (p.status === 'posted') {
    actions = `${p.permalink ? `<a class="btn" href="${esc(p.permalink)}" target="_blank" rel="noopener">Open on Instagram</a>` : ''}<button class="btn" data-act="insights">Refresh stats</button><button class="btn quiet" data-act="archive">Archive</button>`;
  }
  const stats = p.insights
    ? `<div class="stats">${['views', 'reach', 'likes', 'comments', 'shares', 'saved'].filter((k) => k in p.insights).map((k) => `<div class="stat"><div class="n">${num(p.insights[k])}</div><div class="k">${k[0].toUpperCase() + k.slice(1)}</div></div>`).join('')}</div><div class="meta">Updated ${esc(fmtDate(p.insightsAt))}</div>`
    : '';
  return `<div class="detail">
    <div class="player"><video src="/media/${esc(r.id)}/${src}" poster="/media/${esc(r.id)}/cover.jpg" controls playsinline preload="metadata"></video></div>
    <div class="panel">
      <div>
        <div class="title">${esc(r.title)}</div>
        <div class="sub">${esc(r.artist)}${r.episode ? ` · #${String(r.episode).padStart(3, '0')}` : ''}</div>
      </div>
      <div>
        <div class="seg" role="group" aria-label="Version">
          <button data-variant="a" class="${v === 'a' ? 'on' : ''}" ${locked ? 'disabled' : ''} title="Opens inside the word being typed">Version A</button>
          <button data-variant="b" class="${v === 'b' ? 'on' : ''}" ${!r.files.b || locked ? 'disabled' : ''} title="Opens on a rewound glimpse of the ending">Version B</button>
          <button data-variant="nosong" class="${v === 'nosong' ? 'on' : ''}" ${!r.files.nosong || locked ? 'disabled' : ''}>No song</button>
        </div>
        <div class="hint" style="margin-top:6px">${v === 'nosong' ? 'Without the song: posts only typing sounds. Use it if Instagram muted the song version.' : 'The song is in the video. If Instagram mutes it, post the no-song version from your phone and pick the track in the app.'}</div>
      </div>
      <label class="field">Caption
        <textarea id="caption" rows="9" ${locked ? 'readonly' : ''}>${esc(caption)}</textarea>
      </label>
      <div class="counter"><span class="${cs.len > 2200 ? 'over' : ''}">${cs.len} / 2200</span><span class="${cs.tags > 30 ? 'over' : ''}">${cs.tags} / 30 hashtags</span></div>
      <label class="check"><input type="checkbox" id="feed" ${p.shareToFeed ? 'checked' : ''} ${locked ? 'disabled' : ''}> Also show in the main feed</label>
      ${p.status === 'publishing' ? `<div class="note live">${esc(p.step || 'Posting…')}</div>` : ''}
      ${p.error && p.status === 'failed' ? `<div class="note err">${esc(p.error)}</div>` : ''}
      ${!connected && p.status !== 'posted' ? `<div class="note">Connect Instagram in <a href="#settings">Settings</a> to post from here.</div>` : ''}
      ${stats}
      <div class="actions">${actions}</div>
    </div>
  </div>`;
}

function bindDetail(r) {
  const d = $('#detail');
  const cap = $('#caption', d);
  let saveTimer = null;
  cap?.addEventListener('input', () => {
    const cs = captionStats(cap.value);
    const c = $('.counter', d);
    c.innerHTML = `<span class="${cs.len > 2200 ? 'over' : ''}">${cs.len} / 2200</span><span class="${cs.tags > 30 ? 'over' : ''}">${cs.tags} / 30 hashtags</span>`;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save({ caption: cap.value }, false), 600);
  });
  $('#feed', d)?.addEventListener('change', (e) => save({ shareToFeed: e.target.checked }, false));
  d.querySelectorAll('[data-variant]').forEach((b) => b.addEventListener('click', () => save({ variant: b.dataset.variant })));
  const when = $('#when', d);
  if (when) {
    const t = new Date(Date.now() + 3600e3);
    t.setMinutes(0, 0, 0);
    when.value = new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  d.querySelectorAll('[data-act]').forEach((b) =>
    b.addEventListener('click', async () => {
      const act = b.dataset.act;
      try {
        if (cap && !cap.readOnly) await post(`/api/reels/${r.id}`, { caption: cap.value });
        if (act === 'approve' || act === 'unapprove' || act === 'unschedule') await post(`/api/reels/${r.id}`, { action: act });
        if (act === 'archive') {
          await post(`/api/reels/${r.id}`, { archived: true });
          state.selected = null;
          toast('Archived. The files stay in output/.');
        }
        if (act === 'schedule') {
          await post(`/api/reels/${r.id}`, { action: 'schedule', scheduledAt: new Date(when.value).toISOString() });
          toast(`Scheduled for ${fmtDate(new Date(when.value).toISOString())}. Keep the dashboard running.`);
        }
        if (act === 'now' || act === 'retry') {
          if (!confirm(`Post "${r.title}" to @${state.settings?.account?.username ?? 'Instagram'} now?`)) return;
          if (act === 'retry') await post(`/api/reels/${r.id}`, { action: 'approve' });
          await post(`/api/reels/${r.id}/publish`);
          toast('Posting. This takes about a minute.');
        }
        if (act === 'insights') {
          await post(`/api/reels/${r.id}/insights`);
          toast('Stats updated.');
        }
        await loadReels();
        renderQueue();
      } catch (e) {
        toast(e.message, true);
      }
    }),
  );
}

async function save(patch, rerender = true) {
  try {
    await post(`/api/reels/${state.selected}`, patch);
    await loadReels();
    if (rerender) renderQueue();
  } catch (e) {
    toast(e.message, true);
  }
}

// ---------- new reel ----------
const VIBES = [
  ['auto', 'Auto (from tempo and words)'], ['gece', 'Gece · night, red and amber'], ['mono', 'Mono · black and white'],
  ['arabesk', 'Arabesk · VHS, warm'], ['drill', 'Drill · magenta and cyan'], ['ask', 'Aşk · light, pink'],
  ['terminal', 'Terminal · green CRT'], ['whatsapp', 'WhatsApp · chat thread'],
];

const SIGNATURES = [
  ['auto', 'Auto · from the title or lyrics'], ['none', 'None'], ['yinyang', 'Yin yang · the frame splits in two'],
  ['mirror', 'Mirror · ayna, yansıma: the editor turns around'], ['loop', 'Loop · tekrar, yine: the line repeats down the file'],
  ['retro', 'Retro · eski, geçmiş: old green screen'], ['light', 'Light · ışık: switches to light mode'],
];

async function renderNew() {
  const lib = await api('/api/library').catch(() => ({ music: [], lyrics: [] }));
  const n = state.newReel;
  const f = n.form || (n.form = { title: '', artist: '', names: '', hook: '', vibe: 'auto', signature: 'auto', episode: '', story: '', variants: true });
  f.signature ??= 'auto';
  main.innerHTML = `<div class="head"><h1>New reel</h1><span class="sub">Song in, reel out. About 5 minutes.</span></div>
  <div class="form">
    <div class="step"><div class="num">01</div><div class="body">
      <h2>Song</h2>
      <div class="grid2">
        <label class="field">From the library
          <select id="music"><option value="">Choose a file…</option>${lib.music.map((m) => `<option ${m === n.music ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
        </label>
        <div class="field">Or add a file
          <label class="btn" style="align-self:flex-start;height:38px">Choose an audio file…<input type="file" id="upload" accept="audio/*" hidden></label>
        </div>
      </div>
    </div></div>

    <div class="step"><div class="num">02</div><div class="body">
      <h2>Lyrics</h2>
      <label class="field">Paste the lyrics, one line per row
        <textarea id="lyrics" rows="10" placeholder="[Nakarat: Motive]&#10;Yürüdüğüm yollarda oldu bütün hayatım ziyan&#10;…">${esc(n.lyrics)}</textarea>
      </label>
      <div class="hint">Optional section lines like <code>[Nakarat: Poizi]</code> say who sings what. Without them every line goes to the first artist.</div>
      <div class="actions">
        <button class="btn" id="align" ${state.settings?.aligner ? '' : 'disabled'}>Time the lyrics to the song</button>
        <span class="muted">or use an existing file</span>
        <select id="lrcpick" style="width:auto"><option value="">—</option>${lib.lyrics.map((l) => `<option ${l === n.lrc ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      </div>
      ${state.settings && !state.settings.aligner ? '<div class="note">Automatic timing needs a one-time install: run <code>npm run setup:align</code> in the project folder.</div>' : ''}
      <div id="alignjob"></div>
      ${n.lrc ? `<label class="field">Timed lyrics · <span class="meta">${esc(n.lrc)}</span>
        <textarea id="lrc" rows="10"></textarea></label>
        <div class="hint">Each line starts at <code>[mm:ss.xx]</code>. Nudge any that feel early or late; it saves as you type.</div>` : ''}
    </div></div>

    <div class="step"><div class="num">03</div><div class="body">
      <h2>Details</h2>
      <div class="grid3">
        <label class="field">Title <input type="text" id="title" value="${esc(f.title)}" placeholder="Yin Yang"></label>
        <label class="field">Artist <input type="text" id="artist" value="${esc(f.artist)}" placeholder="Motive"></label>
        <label class="field">Cursor names <input type="text" id="names" value="${esc(f.names)}" placeholder="motive, poizi"></label>
      </div>
      <div class="grid3">
        <label class="field">Start on the line <input type="text" id="hook" value="${esc(f.hook)}" placeholder="yürüdüğüm yollarda"></label>
        <label class="field">Look <select id="vibe">${VIBES.map(([k, l]) => `<option value="${k}" ${k === f.vibe ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field">Episode <input type="number" id="episode" value="${esc(f.episode)}" placeholder="next"></label>
      </div>
      <div class="grid3">
        <label class="field">Signature effect <select id="signature">${SIGNATURES.map(([k, l]) => `<option value="${k}" ${k === f.signature ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="hint">One effect per song, fired once on the word that names it. Auto picks from the title, then from words the reel repeats.</div>
      <label class="field">Story notes and twist
        <textarea id="story" rows="5" placeholder="@8 pasaj albümünden.&#10;!error yang is undefined">${esc(f.story)}</textarea>
      </label>
      <div class="hint">Facts you can check only. <code>@8 text</code> shows a note at 8 s. One twist line: <code>! comment</code>, <code>!run</code>, <code>!error</code>, <code>!replace a =&gt; b</code>, <code>!git</code> or <code>!join</code>.</div>
      <label class="check"><input type="checkbox" id="variants" ${f.variants ? 'checked' : ''}> Also render version B (flash-forward hook)</label>
    </div></div>

    <div class="step"><div class="num">04</div><div class="body">
      <div class="actions"><button class="btn primary" id="render">Render the reel</button><span class="muted">It lands in the queue for review.</span></div>
      <div id="renderjob"></div>
    </div></div>
  </div>`;

  const keep = () => {
    for (const k of ['title', 'artist', 'names', 'hook', 'vibe', 'signature', 'episode', 'story']) f[k] = $(`#${k}`).value;
    f.variants = $('#variants').checked;
    n.lyrics = $('#lyrics').value;
  };
  main.querySelectorAll('input, select, textarea').forEach((el) => el.addEventListener('change', keep));
  $('#lyrics').addEventListener('input', keep);
  $('#music').addEventListener('change', (e) => (n.music = e.target.value));
  $('#upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    toast('Uploading…');
    try {
      const r = await api(`/api/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
      n.music = r.music;
      keep();
      renderNew();
      toast('Added to the library.');
    } catch (err) {
      toast(err.message, true);
    }
  });
  $('#lrcpick').addEventListener('change', (e) => {
    keep();
    n.lrc = e.target.value;
    renderNew();
  });
  if (n.lrc) {
    const ta = $('#lrc');
    api(`/api/lyrics?file=${encodeURIComponent(n.lrc)}`).then((r) => (ta.value = r.text));
    let t = null;
    ta.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => post(`/api/lyrics?file=${encodeURIComponent(n.lrc)}`, { text: ta.value }).catch((err) => toast(err.message, true)), 500);
    });
  }
  $('#align').addEventListener('click', async () => {
    keep();
    try {
      const job = await post('/api/align', { music: n.music, lyrics: n.lyrics, name: f.artist && f.title ? `${f.artist}-${f.title}` : '' });
      n.alignJob = job.id;
      followJob(job.id, '#alignjob', (j) => {
        if (j.status === 'done' && j.result?.lrc) {
          n.lrc = j.result.lrc.split('/').pop();
          renderNew();
          toast(j.result.weakLines?.length ? `Timed. Check ${j.result.weakLines.length} line(s) the song didn't clearly match.` : 'Lyrics timed.');
        }
      });
    } catch (err) {
      toast(err.message, true);
    }
  });
  $('#render').addEventListener('click', async () => {
    keep();
    try {
      const job = await post('/api/render', { music: n.music, lrc: n.lrc, ...f });
      n.renderJob = job.id;
      followJob(job.id, '#renderjob', async (j) => {
        if (j.status === 'done' && j.result?.reelId) {
          toast('Rendered. It is in the queue.');
          await loadReels();
          state.selected = j.result.reelId;
        }
      });
    } catch (err) {
      toast(err.message, true);
    }
  });
  if (n.alignJob) followJob(n.alignJob, '#alignjob');
  if (n.renderJob) followJob(n.renderJob, '#renderjob');
}

const followers = new Map();
function followJob(id, sel, onEnd) {
  clearInterval(followers.get(sel));
  const tick = async () => {
    const box = $(sel);
    if (!box) return clearInterval(followers.get(sel));
    let j;
    try {
      j = await api(`/api/jobs/${id}`);
    } catch {
      return;
    }
    const pct = j.progress != null ? Math.round(j.progress * 100) : null;
    box.innerHTML = `<div class="actions" style="justify-content:space-between"><span class="status"><span class="dot ${j.status === 'done' ? 'ok' : j.status === 'failed' ? 'err' : 'live'}"></span>${esc(j.label)}</span><span class="meta">${j.status === 'running' ? (pct != null ? pct + '%' : 'working') : j.status}</span></div>
      ${j.status === 'running' ? `<div class="bar"><i style="width:${pct ?? 3}%"></i></div>` : ''}
      <div class="log">${esc(j.lines.slice(-14).join('\n'))}</div>`;
    const log = $('.log', box);
    log.scrollTop = log.scrollHeight;
    if (j.status !== 'running') {
      clearInterval(followers.get(sel));
      onEnd?.(j);
    }
  };
  followers.set(sel, setInterval(tick, 1500));
  tick();
}

// ---------- settings ----------
async function renderSettings() {
  await loadSettings();
  const s = state.settings || {};
  const a = s.account;
  const expires = s.tokenExpiresAt || (s.tokenSavedAt ? new Date(Date.parse(s.tokenSavedAt) + 60 * 864e5).toISOString() : null);
  main.innerHTML = `<div class="head"><h1>Settings</h1></div>
  <div style="display:flex;flex-direction:column;gap:20px">
    <div class="card">
      <h2>Instagram</h2>
      ${s.connected && a ? `<div class="acct">${a.picture ? `<img src="${esc(a.picture)}" alt="">` : ''}<div><div style="font-weight:500">@${esc(a.username)}</div><div class="meta">${esc((a.accountType || '').toLowerCase().replace('_', ' '))} · id ${esc(a.userId)}</div></div></div>
        <div class="kv"><span class="k">Token renews</span><span>automatically every 20 days${expires ? ` · valid until ${esc(fmtDate(expires))}` : ''}</span>
        ${s.limit ? `<span class="k">Posts in the last 24 h</span><span class="meta">${s.limit.used} / ${s.limit.total}</span>` : ''}</div>
        <div class="actions"><button class="btn" id="refresh">Renew token now</button><button class="btn quiet" id="disconnect">Disconnect</button></div>`
      : s.connected && s.error ? `<div class="note err">${esc(s.error)}</div><div class="actions"><button class="btn quiet" id="disconnect">Disconnect</button></div>` : ''}
      ${!s.connected || s.error ? `
      <p class="sub" style="margin:0">One-time setup, about 15 minutes. Posting uses Instagram's official API, so it needs a Professional account and a free Meta developer app. No Facebook Page needed.</p>
      <ol class="guide">
        <li>In the Instagram app: <b>Settings → Account type and tools → Switch to professional account</b>. Pick <b>Creator</b>.</li>
        <li>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a>, log in, press <b>Create app</b>. Use case: <b>Manage messaging and content on Instagram</b>. Name it something like <code>codemusic studio</code>.</li>
        <li>In the app, open <b>Instagram → API setup with Instagram login</b>. Under <b>Generate access tokens</b>, press <b>Add account</b> and log in with your reels account. If Instagram asks you to accept a tester invite, accept it in the app under <b>Settings → Website permissions → Apps and websites → Tester invites</b>.</li>
        <li>Press <b>Generate token</b> next to the account, tick the permissions it offers (at least <code>instagram_business_basic</code> and <code>instagram_business_content_publish</code>; add <code>instagram_business_manage_insights</code> for stats), and copy the token.</li>
        <li>Paste it here. It is saved only in the project's <code>.env</code> file on this Mac.</li>
      </ol>
      <label class="field">Access token <input type="password" id="token" placeholder="IGAA…" autocomplete="off"></label>
      <div class="actions"><button class="btn primary" id="save">Connect</button></div>
      <div class="hint">You can leave the app in development mode: it only needs to post to your own account.</div>` : ''}
    </div>
    <div class="card">
      <h2>This Mac</h2>
      <div class="kv">
        <span class="k">Studio name</span><span>${esc(s.studio || '—')}</span>
        <span class="k">Temporary links</span><span>${s.cloudflared ? '<span class="status"><span class="dot ok"></span>cloudflared installed</span>' : '<span class="status"><span class="dot err"></span>missing: <code>brew install cloudflared</code></span>'}</span>
        <span class="k">Lyric timing</span><span>${s.aligner ? '<span class="status"><span class="dot ok"></span>installed</span>' : '<span class="status"><span class="dot warn"></span>run <code>npm run setup:align</code></span>'}</span>
        <span class="k">Instagram API</span><span class="meta">${esc(s.apiVersion || '')}</span>
      </div>
      <div class="hint">Scheduled posts go out only while this dashboard is running and the Mac is awake. If it was off at the scheduled time, the post goes out as soon as the dashboard starts again.</div>
    </div>
  </div>`;
  $('#save')?.addEventListener('click', async () => {
    try {
      await post('/api/settings/token', { token: $('#token').value });
      toast('Connected.');
      renderSettings();
    } catch (e) {
      toast(e.message, true);
    }
  });
  $('#refresh')?.addEventListener('click', async () => {
    try {
      await post('/api/settings/refresh');
      toast('Token renewed for 60 days.');
      renderSettings();
    } catch (e) {
      toast(e.message, true);
    }
  });
  $('#disconnect')?.addEventListener('click', async () => {
    if (!confirm('Disconnect Instagram? Scheduled posts will fail until you connect again.')) return;
    await post('/api/settings/disconnect');
    renderSettings();
  });
}

// ---------- live updates ----------
async function poll() {
  const before = JSON.stringify(state.reels.map((r) => [r.id, r.post.status, r.post.step, r.post.error]));
  const { jobs } = await api('/api/jobs').catch(() => ({ jobs: [] }));
  const running = jobs.filter((j) => j.status === 'running').length;
  $('#count-jobs').textContent = running ? `${running} running` : '';
  await loadReels().catch(() => undefined);
  const after = JSON.stringify(state.reels.map((r) => [r.id, r.post.status, r.post.step, r.post.error]));
  // Only re-render the queue when something changed, and never while the caption is being edited.
  if (state.view === 'queue' && before !== after && document.activeElement?.id !== 'caption') renderQueue();
}

(async () => {
  await loadSettings();
  await loadReels().catch(() => undefined);
  route();
  setInterval(poll, 4000);
})();
