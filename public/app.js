/* SocialFlow frontend — talks to the Express API under API_BASE. */
(() => {
'use strict';

const API_BASE = document.querySelector('meta[name="api-base"]')?.content || '/api';
const TOKEN_KEY = 'sf_token';

const PLATFORMS = {
  instagram: { label: 'Instagram', icon: '📸', cls: 'ig', bg: '#FEE2E2', color: 'linear-gradient(90deg,#833AB4,#FD1D1D)', solid: '#E1306C', desc: 'Business account posts (needs an image)' },
  facebook:  { label: 'Facebook',  icon: '📘', cls: 'fb', bg: '#E7F0FD', color: '#1877F2', solid: '#1877F2', desc: 'Facebook Page posts' },
  twitter:   { label: 'Twitter/X', icon: '🐦', cls: 'tw', bg: '#E9F0F7', color: '#1DA1F2', solid: '#1DA1F2', desc: 'Tweets' },
  linkedin:  { label: 'LinkedIn',  icon: '💼', cls: 'li', bg: '#E7EFF7', color: '#0A66C2', solid: '#0A66C2', desc: 'Personal profile posts' },
};
const PLAN_LIMITS = { free: 10, creator: Infinity, pro: Infinity };
const TITLES = { dashboard: 'Dashboard', compose: 'Compose', posts: 'Posts', calendar: 'Calendar', analytics: 'Analytics', connectors: 'Connectors', pricing: 'Plans' };

const state = {
  user: null,
  view: 'dashboard',
  editingId: null,
  selected: new Set(['twitter', 'linkedin']),
  postsPage: 1,
  cal: { y: new Date().getFullYear(), m: new Date().getMonth() },
};

/* ── Helpers ──────────────────────────────────────────────────── */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtNum = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
};

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d), now = new Date();
  const sameDay = dt.toDateString() === now.toDateString();
  const time = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today ${time}`;
  const opts = { month: 'short', day: 'numeric' };
  if (dt.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return `${dt.toLocaleDateString([], opts)} ${time}`;
};

// datetime-local wants local time without timezone
const toLocalInput = (d) => {
  const dt = new Date(d);
  dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
  return dt.toISOString().slice(0, 16);
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

async function withBusy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (err) { toast(err.message); }
  finally { if (btn) btn.disabled = false; }
}

/* ── API client ───────────────────────────────────────────────── */
async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register') && !path.startsWith('/auth/password')) {
    logout();
    throw new Error('Session expired — please log in again.');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ── Auth ─────────────────────────────────────────────────────── */
let authMode = 'login';

function setAuthMode(mode) {
  authMode = mode;
  const reg = mode === 'register';
  $('#auth-title').textContent = reg ? 'Create your account' : 'Welcome back';
  $('#auth-sub').textContent = reg ? 'Start scheduling posts in under a minute.' : 'Log in to manage your social posts.';
  $('#name-field').hidden = !reg;
  $('#name-field input').required = reg;
  $('#auth-submit').textContent = reg ? 'Create account' : 'Log in';
  $('#auth-switch-text').textContent = reg ? 'Already have an account?' : 'No account yet?';
  $('#auth-switch').textContent = reg ? 'Log in' : 'Create one';
  $('#auth-form [name=password]').autocomplete = reg ? 'new-password' : 'current-password';
  $('#auth-error').classList.remove('show');
}

function showAuth() {
  $('#auth-screen').hidden = false;
  setAuthMode('login');
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const body = Object.fromEntries(new FormData(form));
  if (authMode === 'login') delete body.name;
  const errBox = $('#auth-error');
  errBox.classList.remove('show');

  await withBusy($('#auth-submit'), async () => {
    try {
      const { token, user } = await api(`/auth/${authMode}`, { method: 'POST', body });
      localStorage.setItem(TOKEN_KEY, token);
      form.reset();
      $('#auth-screen').hidden = true;
      setUser(user);
      route();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('show');
    }
  });
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  state.user = null;
  $('#user-menu').classList.remove('show');
  showAuth();
}

function setUser(user) {
  state.user = user;
  const initials = user.name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
  $('#user-avatar').textContent = initials || '?';
  $('#user-name').textContent = user.name;
  $('#user-plan').textContent = `${user.plan[0].toUpperCase()}${user.plan.slice(1)} Plan`;
}

async function refreshUser() {
  const { user } = await api('/auth/me');
  setUser(user);
  return user;
}

/* ── Navigation ───────────────────────────────────────────────── */
const loaders = {
  dashboard: loadDashboard,
  compose:   renderCompose,
  posts:     loadPosts,
  calendar:  loadCalendar,
  analytics: loadAnalytics,
  connectors: loadConnectors,
  pricing:   renderPricing,
};

function nav(id, { push = true } = {}) {
  if (!TITLES[id]) id = 'dashboard';
  state.view = id;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `v-${id}`));
  $$('.sidebar .nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === id));
  $('#ptitle').textContent = TITLES[id];
  $('#sidebar').classList.remove('open');
  if (push) history.pushState({ view: id }, '', id === 'dashboard' ? '/' : `/${id}`);
  Promise.resolve(loaders[id]?.()).catch(err => toast(err.message));
}

// Pick the view from the URL path; also handles OAuth callback query params
function route() {
  const path = location.pathname.replace(/^\/+|\/+$/g, '') || 'dashboard';
  const params = new URLSearchParams(location.search);
  if (params.has('connected')) {
    toast(`✓ ${PLATFORMS[params.get('connected')]?.label || params.get('connected')} connected`);
    refreshUser().catch(() => {});
  } else if (params.has('error')) {
    toast(`Connection failed: ${params.get('error').replace(/_/g, ' ')}`);
  }
  if (params.toString()) history.replaceState({}, '', location.pathname);
  nav(path, { push: false });
}

/* ── Shared renderers ─────────────────────────────────────────── */
const STATUS_PILL = {
  draft: 'pill-dft', scheduled: 'pill-sch', published: 'pill-pub', failed: 'pill-fail', publishing: 'pill-pubing',
};

function postRow(p, { actions = false } = {}) {
  const first = PLATFORMS[p.platforms[0]] || { icon: '📱', bg: 'var(--bg2)' };
  const plats = p.platforms.map(k => PLATFORMS[k]?.label || k).join(', ');
  const when = p.status === 'published' ? fmtDate(p.publishedAt)
    : p.status === 'scheduled' ? fmtDate(p.scheduledAt)
    : fmtDate(p.updatedAt || p.createdAt);
  const likes = p.status === 'published' && p.analytics ? `<span>❤️ ${fmtNum(p.analytics.likes)}</span>` : '';
  const links = (p.results || []).filter(r => r.url).map(r =>
    `<a class="result-link" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(PLATFORMS[r.platform]?.label || r.platform)} ↗</a>`).join(' ');
  const errors = (p.results || []).filter(r => r.status === 'failed' && r.error)
    .map(r => `${esc(PLATFORMS[r.platform]?.label || r.platform)}: ${esc(r.error)}`).join(' · ');
  const editable = p.status !== 'published';

  return `
    <div class="post-row" data-id="${esc(p._id)}">
      <div class="plat-icon" style="background:${first.bg}">${first.icon}</div>
      <div class="post-main">
        <div class="post-text${actions ? ' full' : ''}">${esc(p.text)}</div>
        <div class="post-meta">
          <span class="pill ${STATUS_PILL[p.status] || 'pill-dft'}">${esc(p.status)}</span>
          <span>${esc(plats)}${when ? ' · ' + esc(when) : ''}</span>
          ${likes}
        </div>
        ${actions && links ? `<div class="post-meta" style="margin-top:4px">${links}</div>` : ''}
        ${actions && errors ? `<div class="post-meta" style="margin-top:4px;color:var(--red)">${errors}</div>` : ''}
      </div>
      ${actions ? `<div class="post-actions">
        ${editable ? '<button class="btn btn-ghost btn-sm" data-post-action="edit">Edit</button>' : ''}
        ${editable ? '<button class="btn btn-ghost btn-sm" data-post-action="publish">Publish</button>' : ''}
        <button class="btn btn-ghost btn-sm" data-post-action="delete" title="Delete">🗑</button>
      </div>` : ''}
    </div>`;
}

function lineChart(svg, data, labels, color) {
  const W = svg.getBoundingClientRect().width || 500, H = Number(svg.getAttribute('height'));
  const pad = { t: 10, r: 10, b: 28, l: 38 };
  const dw = W - pad.l - pad.r, dh = H - pad.t - pad.b;
  const mx = Math.max(1, ...data);
  const xs = i => pad.l + (data.length > 1 ? i / (data.length - 1) : 0.5) * dw;
  const ys = v => pad.t + dh - (v / mx * dh);
  const pts = data.map((v, i) => `${xs(i)},${ys(v)}`).join(' ');
  const area = data.map((v, i) => `${xs(i)},${ys(v)}`).join(' L') + ` L${xs(data.length - 1)},${H - pad.b} L${xs(0)},${H - pad.b} Z`;
  const gid = 'g' + Math.random().toString(36).slice(2);
  const tickIdx = [0, 0.25, 0.5, 0.75, 1].map(t => Math.round(t * (data.length - 1)));
  svg.innerHTML = `
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity=".25"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    ${[0, .5, 1].map(t => {
      const val = Math.round(mx * t), y = ys(val);
      return `<line x1="${pad.l}" y1="${y}" x2="${pad.l + dw}" y2="${y}" stroke="currentColor" stroke-opacity=".07"/>
              <text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="currentColor" opacity=".45">${fmtNum(val)}</text>`;
    }).join('')}
    <path d="M${area}" fill="url(#${gid})"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${data.map((v, i) => `<circle cx="${xs(i)}" cy="${ys(v)}" r="${i === data.length - 1 ? 4 : 2.5}" fill="${color}"><title>${esc(labels[i])}: ${v}</title></circle>`).join('')}
    ${[...new Set(tickIdx)].map(i => `<text x="${xs(i)}" y="${H - 4}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".45">${esc(labels[i])}</text>`).join('')}`;
}

function barChart(svg, rows) {
  const W = svg.getBoundingClientRect().width || 300, H = Number(svg.getAttribute('height'));
  if (!rows.length) {
    svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="12" fill="currentColor" opacity=".45">No published posts yet</text>`;
    return;
  }
  const pad = { t: 16, b: 26 };
  const mx = Math.max(1, ...rows.map(r => r.value));
  const slot = W / rows.length, bw = Math.min(48, slot * 0.55), dh = H - pad.t - pad.b;
  svg.innerHTML = rows.map((r, i) => {
    const h = Math.max(2, r.value / mx * dh), x = i * slot + (slot - bw) / 2, y = pad.t + dh - h;
    return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" fill="${r.color}"><title>${esc(r.label)}: ${r.value}</title></rect>
      <text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="10.5" font-weight="600" fill="currentColor">${fmtNum(r.value)}</text>
      <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="10.5" fill="currentColor" opacity=".55">${esc(r.label)}</text>`;
  }).join('');
}

// Count/sum values per day over the last `days` days
function dailySeries(posts, days, valueFn) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const buckets = Array(days).fill(0), labels = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString([], { month: 'short', day: 'numeric' }));
  }
  posts.forEach(p => {
    if (!p.publishedAt) return;
    const d = new Date(p.publishedAt); d.setHours(0, 0, 0, 0);
    const idx = days - 1 - Math.round((today - d) / 864e5);
    if (idx >= 0 && idx < days) buckets[idx] += valueFn(p);
  });
  return { data: buckets, labels };
}

/* ── Dashboard ────────────────────────────────────────────────── */
async function loadDashboard() {
  const [overview, byPlatform, recent, scheduled, published] = await Promise.all([
    api('/analytics/overview'),
    api('/analytics/by-platform'),
    api('/posts?limit=5'),
    api('/posts?status=scheduled&limit=100'),
    api('/posts?status=published&limit=200'),
  ]);

  const e = overview.engagement;
  $('#st-reach').textContent = fmtNum(e.reach);
  $('#st-eng').textContent = fmtNum(e.likes + e.comments + e.shares);
  $('#st-pub').textContent = fmtNum(overview.publishedPosts);
  $('#st-pub-sub').textContent = `${fmtNum(overview.totalPosts)} posts total`;
  $('#st-sch').textContent = fmtNum(overview.scheduledPosts);
  const next = scheduled.posts.filter(p => p.scheduledAt).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0];
  $('#st-next').textContent = next ? `Next: ${fmtDate(next.scheduledAt)}` : 'Nothing queued';
  updateSchedBadge(overview.scheduledPosts);

  const { data, labels } = dailySeries(published.posts, 14, p => p.analytics?.likes || 0);
  lineChart($('#chart-svg'), data, labels, '#FF4421');

  $('#recent-posts').innerHTML = recent.posts.length
    ? recent.posts.map(p => postRow(p)).join('')
    : '<div class="empty">No posts yet — hit <strong>New Post</strong> to write your first one.</div>';

  const totalReach = byPlatform.reduce((s, r) => s + r.reach, 0);
  $('#reach-list').innerHTML = byPlatform.length ? byPlatform.map(r => {
    const p = PLATFORMS[r._id] || { icon: '📱', label: r._id, color: 'var(--fg3)' };
    const pct = totalReach ? Math.round(r.reach / totalReach * 100) : 0;
    return `<div class="reach-row">
      <div class="reach-name"><span>${p.icon}</span> ${esc(p.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${p.color}"></div></div>
      <div class="reach-pct">${pct}%</div></div>`;
  }).join('') : '<div class="empty" style="padding:8px 0">Publish a post to see reach by platform.</div>';

  renderDashConnections();
}

function renderDashConnections() {
  const connected = new Set(state.user?.connected || []);
  $('#dash-conn').innerHTML = Object.entries(PLATFORMS).map(([k, p]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 11px;background:var(--bg2);border-radius:var(--r-sm)">
      <div style="font-size:12px;font-weight:500;color:var(--fg2)">${p.icon} ${p.label}</div>
      <span class="badge ${connected.has(k) ? 'b-on' : 'b-off'}">${connected.has(k) ? 'Connected' : 'Not connected'}</span>
    </div>`).join('');
}

function updateSchedBadge(n) {
  const b = $('#sched-badge');
  b.hidden = !n;
  b.textContent = n;
}

/* ── Compose ──────────────────────────────────────────────────── */
function renderCompose() {
  $('#compose-chips').innerHTML = Object.entries(PLATFORMS).map(([k, p]) =>
    `<div class="chip ${p.cls}${state.selected.has(k) ? ' on' : ''}" data-platform="${k}" role="button" tabindex="0">${p.icon} ${p.label}</div>`).join('');
  $('#compose-title').textContent = state.editingId ? 'Edit Post' : 'Create a Post';
  $('#cancel-edit').hidden = !state.editingId;
  $('#draft-btn').textContent = state.editingId ? 'Save Changes' : 'Save Draft';
  updateChar();
}

function updateChar() {
  const len = $('#compose-text').value.length;
  const max = state.selected.has('twitter') ? 280 : 2200;
  const el = $('#char-count');
  el.textContent = `${len} / ${max}`;
  el.className = 'char-count' + (len > max ? ' over' : len > max * 0.9 ? ' warn' : '');
}

function resetCompose() {
  state.editingId = null;
  $('#compose-text').value = '';
  $('#media-url').value = '';
  $('#media-wrap').hidden = true;
  $('#sched-time').value = '';
  renderCompose();
}

function readCompose() {
  const text = $('#compose-text').value.trim();
  const platforms = [...state.selected];
  if (!text) throw new Error('Write something first');
  if (!platforms.length) throw new Error('Pick at least one platform');
  if (platforms.includes('twitter') && text.length > 280) throw new Error('Too long for Twitter/X (280 max)');
  const media = $('#media-url').value.trim();
  if (platforms.includes('instagram') && !media) throw new Error('Instagram needs an image — add a media URL');
  return { text, platforms, mediaUrls: media ? [media] : [] };
}

async function savePost(extra = {}) {
  const body = { ...readCompose(), ...extra };
  if (state.editingId) return api(`/posts/${state.editingId}`, { method: 'PUT', body });
  return api('/posts', { method: 'POST', body });
}

async function onSaveDraft(e) {
  await withBusy(e.currentTarget, async () => {
    const editing = !!state.editingId;
    await savePost();
    toast(editing ? '✓ Changes saved' : '✓ Draft saved');
    resetCompose();
    if (editing) nav('posts');
  });
}

async function onSchedule(e) {
  await withBusy(e.currentTarget, async () => {
    const v = $('#sched-time').value;
    if (!v) { $('#sched-time').focus(); throw new Error('Pick a date & time in the Schedule card'); }
    const when = new Date(v);
    if (when <= new Date()) throw new Error('Scheduled time must be in the future');
    await savePost({ scheduledAt: when.toISOString() });
    toast(`📅 Scheduled for ${fmtDate(when)}`);
    resetCompose();
    nav('calendar');
  });
}

async function onPublishNow(e) {
  await withBusy(e.currentTarget, async () => {
    const post = await savePost();
    const result = await api(`/posts/${post._id}/publish`, { method: 'POST' });
    resetCompose();
    reportPublish(result);
    nav('posts');
  });
}

function reportPublish(post) {
  const failed = (post.results || []).filter(r => r.status !== 'success');
  if (!failed.length) toast('🚀 Published!');
  else toast(`Published with errors on ${failed.map(r => PLATFORMS[r.platform]?.label || r.platform).join(', ')} — see Posts`);
}

async function onGenerate(e) {
  const topic = $('#ai-prompt').value.trim();
  if (!topic) { $('#ai-prompt').focus(); return toast('Describe your topic first'); }
  const status = $('#gen-status'), box = $('#ai-suggestions');
  box.innerHTML = '';
  status.classList.add('show');
  await withBusy(e.currentTarget, async () => {
    try {
      const { captions } = await api('/ai/captions', { method: 'POST', body: { topic, platforms: [...state.selected] } });
      box.innerHTML = captions.map(c => `<div class="ai-sug" role="button" tabindex="0">${esc(c)}</div>`).join('');
    } finally {
      status.classList.remove('show');
    }
  });
}

async function onHashtags(e) {
  const text = $('#compose-text').value.trim();
  if (!text) return toast('Write your caption first');
  await withBusy(e.currentTarget, async () => {
    const { hashtags = [] } = await api('/ai/hashtags', { method: 'POST', body: { text } });
    if (!hashtags.length) return toast('No hashtags suggested');
    $('#compose-text').value = `${text}\n\n${hashtags.join(' ')}`;
    updateChar();
  });
}

function editPost(p) {
  state.editingId = p._id;
  state.selected = new Set(p.platforms);
  $('#compose-text').value = p.text;
  $('#media-url').value = p.mediaUrls?.[0] || '';
  $('#media-wrap').hidden = !p.mediaUrls?.length;
  $('#sched-time').value = p.scheduledAt ? toLocalInput(p.scheduledAt) : '';
  nav('compose');
}

/* ── Posts list ───────────────────────────────────────────────── */
let postsCache = [];

async function loadPosts() {
  const qs = new URLSearchParams({ page: state.postsPage, limit: 10 });
  const status = $('#f-status').value, platform = $('#f-platform').value;
  if (status) qs.set('status', status);
  if (platform) qs.set('platform', platform);

  const { posts, total, page, pages } = await api(`/posts?${qs}`);
  postsCache = posts;
  $('#posts-count').textContent = `${total} post${total === 1 ? '' : 's'}`;
  $('#posts-list').innerHTML = posts.length
    ? posts.map(p => postRow(p, { actions: true })).join('')
    : '<div class="empty">No posts match these filters.</div>';
  $('#pager').innerHTML = pages > 1 ? `
    <button class="btn btn-ghost btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
    <span>Page ${page} of ${pages}</span>
    <button class="btn btn-ghost btn-sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next →</button>` : '';
}

async function onPostAction(btn) {
  const id = btn.closest('.post-row').dataset.id;
  const post = postsCache.find(p => p._id === id);
  const action = btn.dataset.postAction;

  if (action === 'edit') return editPost(post);
  if (action === 'delete') {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    await withBusy(btn, async () => {
      await api(`/posts/${id}`, { method: 'DELETE' });
      toast('Post deleted');
      await loadPosts();
    });
  }
  if (action === 'publish') {
    await withBusy(btn, async () => {
      const result = await api(`/posts/${id}/publish`, { method: 'POST' });
      reportPublish(result);
      await loadPosts();
    });
  }
}

/* ── Calendar ─────────────────────────────────────────────────── */
let calPosts = [];

async function loadCalendar() {
  const { posts } = await api('/posts?limit=500');
  calPosts = posts;
  drawCalendar();
}

function drawCalendar() {
  const { y, m } = state.cal;
  $('#cal-month').textContent = new Date(y, m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });

  const byDay = {};
  calPosts.forEach(p => {
    const d = p.scheduledAt || p.publishedAt;
    if (!d) return;
    const dt = new Date(d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m) return;
    (byDay[dt.getDate()] ||= []).push(p);
  });

  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();
  const today = new Date();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(`<div class="cal-cell dim"><div class="cal-num">${prevDays - first + 1 + i}</div></div>`);
  for (let d = 1; d <= days; d++) {
    const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
    const chips = (byDay[d] || []).map(p => {
      const dt = new Date(p.scheduledAt || p.publishedAt);
      const t = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const icons = p.platforms.map(k => PLATFORMS[k]?.icon || '').join('');
      return `<div class="cal-chip s-${esc(p.status)}" title="${esc(p.text)}">${icons} ${esc(t)} · ${esc(p.text)}</div>`;
    }).join('');
    cells.push(`<div class="cal-cell${isToday ? ' today' : ''}"><div class="cal-num">${d}</div>${chips}</div>`);
  }
  const tail = (7 - cells.length % 7) % 7;
  for (let i = 1; i <= tail; i++) cells.push(`<div class="cal-cell dim"><div class="cal-num">${i}</div></div>`);
  $('#cal-body').innerHTML = cells.join('');
}

function shiftMonth(delta) {
  let { y, m } = state.cal;
  m += delta;
  if (m > 11) { m = 0; y++; }
  if (m < 0)  { m = 11; y--; }
  state.cal = { y, m };
  drawCalendar();
}

/* ── Analytics ────────────────────────────────────────────────── */
async function loadAnalytics() {
  const [overview, byPlatform, top, published] = await Promise.all([
    api('/analytics/overview'),
    api('/analytics/by-platform'),
    api('/analytics/top-posts'),
    api('/posts?status=published&limit=500'),
  ]);
  const e = overview.engagement;
  $('#an-likes').textContent = fmtNum(e.likes);
  $('#an-comments').textContent = fmtNum(e.comments);
  $('#an-shares').textContent = fmtNum(e.shares);
  $('#an-reach').textContent = fmtNum(e.reach);

  const { data, labels } = dailySeries(published.posts, 30, () => 1);
  lineChart($('#analytics-svg'), data, labels, '#00C9A7');

  barChart($('#bar-svg'), byPlatform.map(r => ({
    label: PLATFORMS[r._id]?.label || r._id,
    value: r.likes,
    color: PLATFORMS[r._id]?.solid || '#9898A6',
  })));

  $('#top-posts').innerHTML = top.length ? top.map(p => {
    const first = PLATFORMS[p.platforms[0]] || { icon: '📱', bg: 'var(--bg2)' };
    return `<div class="post-row">
      <div class="plat-icon" style="background:${first.bg};border-radius:50%">${first.icon}</div>
      <div style="min-width:0;flex:1">
        <div class="post-text">${esc(p.text)}</div>
        <div class="post-meta">${esc(p.platforms.map(k => PLATFORMS[k]?.label || k).join(', '))} · ${fmtDate(p.publishedAt)}</div>
      </div>
      <div style="font-family:var(--font-d);font-size:14px;font-weight:700;color:var(--accent)">❤️ ${fmtNum(p.analytics?.likes)}</div>
    </div>`;
  }).join('') : '<div class="empty">No published posts yet.</div>';
}

/* ── Connectors ───────────────────────────────────────────────── */
async function loadConnectors() {
  const { connected } = await api('/platforms');
  if (state.user) state.user.connected = connected;
  const set = new Set(connected);
  $('#conn-sub').textContent = `${connected.length} of ${Object.keys(PLATFORMS).length} accounts connected.`;
  $('#conn-grid').innerHTML = Object.entries(PLATFORMS).map(([k, p]) => `
    <div class="conn-card">
      <div class="conn-icon" style="background:${p.bg}">${p.icon}</div>
      <div class="conn-info">
        <div class="conn-name">${p.label}</div>
        <div class="conn-desc">${set.has(k) ? '<span style="color:var(--green);font-weight:600">● Connected</span> · ' : ''}${p.desc}</div>
      </div>
      ${set.has(k)
        ? `<button class="btn btn-ghost btn-sm" data-disconnect="${k}">Disconnect</button>`
        : `<button class="badge b-btn" data-connect="${k}">Connect</button>`}
    </div>`).join('');
}

async function onConnect(btn) {
  await withBusy(btn, async () => {
    const { url } = await api(`/platforms/${btn.dataset.connect}/connect?json=1`);
    location.href = url;
  });
}

async function onDisconnect(btn) {
  const k = btn.dataset.disconnect;
  if (!confirm(`Disconnect ${PLATFORMS[k].label}? Scheduled posts to it will fail.`)) return;
  await withBusy(btn, async () => {
    await api(`/platforms/${k}`, { method: 'DELETE' });
    toast(`${PLATFORMS[k].label} disconnected`);
    await loadConnectors();
  });
}

/* ── Plans ────────────────────────────────────────────────────── */
function renderPricing() {
  const plan = state.user?.plan || 'free';
  const limit = PLAN_LIMITS[plan];
  $('#plan-usage').textContent = `You're on the ${plan[0].toUpperCase() + plan.slice(1)} plan` +
    (Number.isFinite(limit) ? ` · ${state.user.postsThisMonth} of ${limit} posts used this month.` : ' · unlimited posts.');
  $$('.price-card').forEach(card => {
    const isCurrent = card.dataset.plan === plan;
    card.classList.toggle('current', isCurrent);
    const btn = $('.plan-btn', card);
    btn.disabled = isCurrent;
    if (isCurrent) btn.textContent = 'Current plan';
  });
}

/* ── Password modal ───────────────────────────────────────────── */
async function onPasswordSubmit(e) {
  e.preventDefault();
  const form = e.target, err = $('#pw-error');
  err.classList.remove('show');
  await withBusy($('button[type=submit]', form), async () => {
    try {
      await api('/auth/password', { method: 'PUT', body: Object.fromEntries(new FormData(form)) });
      form.reset();
      $('#pw-modal').classList.remove('show');
      toast('✓ Password updated');
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.add('show');
    }
  });
}

/* ── Theme & layout ───────────────────────────────────────────── */
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('sf_theme'); } catch {}
  if (saved) document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme')
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('sf_theme', next); } catch {}
  if (state.view === 'dashboard' || state.view === 'analytics') loaders[state.view]().catch(() => {});
}

function checkMobile() {
  $('#menu-btn').style.display = innerWidth <= 860 ? 'flex' : 'none';
}

/* ── Event wiring ─────────────────────────────────────────────── */
function bind() {
  $('#auth-form').addEventListener('submit', onAuthSubmit);
  $('#auth-switch').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
  $('#pw-form').addEventListener('submit', onPasswordSubmit);

  $('#theme-btn').addEventListener('click', toggleTheme);
  $('#menu-btn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#sb-scrim').addEventListener('click', () => $('#sidebar').classList.remove('open'));
  addEventListener('resize', checkMobile);
  addEventListener('popstate', () => state.user && route());

  $('#compose-text').addEventListener('input', updateChar);
  $('#draft-btn').addEventListener('click', onSaveDraft);
  $('#schedule-btn').addEventListener('click', onSchedule);
  $('#publish-btn').addEventListener('click', onPublishNow);
  $('#gen-btn').addEventListener('click', onGenerate);
  $('#ai-prompt').addEventListener('keydown', e => { if (e.key === 'Enter') $('#gen-btn').click(); });
  $('#hashtag-btn').addEventListener('click', onHashtags);
  $('#media-btn').addEventListener('click', () => { $('#media-wrap').hidden = false; $('#media-url').focus(); });
  $('#cancel-edit').addEventListener('click', resetCompose);

  $('#f-status').addEventListener('change', () => { state.postsPage = 1; loadPosts().catch(e => toast(e.message)); });
  $('#f-platform').addEventListener('change', () => { state.postsPage = 1; loadPosts().catch(e => toast(e.message)); });

  $('#cal-prev').addEventListener('click', () => shiftMonth(-1));
  $('#cal-next').addEventListener('click', () => shiftMonth(1));
  $('#cal-today').addEventListener('click', () => { const n = new Date(); state.cal = { y: n.getFullYear(), m: n.getMonth() }; drawCalendar(); });

  $('#user-row').addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) $('#user-menu').classList.toggle('show');
  });

  // Delegated clicks
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t.closest('#user-row')) $('#user-menu').classList.remove('show');

    const navEl = t.closest('[data-nav]');
    if (navEl) {
      if (navEl.dataset.nav === 'compose' && !navEl.closest('.sidebar') && state.editingId) resetCompose();
      return nav(navEl.dataset.nav);
    }

    const chip = t.closest('.chip[data-platform]');
    if (chip) {
      const k = chip.dataset.platform;
      state.selected.has(k) ? state.selected.delete(k) : state.selected.add(k);
      chip.classList.toggle('on');
      return updateChar();
    }

    const sug = t.closest('.ai-sug');
    if (sug) {
      $('#compose-text').value = sug.textContent;
      updateChar();
      return toast('Caption added ✓');
    }

    const postBtn = t.closest('[data-post-action]');
    if (postBtn) return onPostAction(postBtn);

    const pageBtn = t.closest('[data-page]');
    if (pageBtn) { state.postsPage = Number(pageBtn.dataset.page); return loadPosts().catch(err => toast(err.message)); }

    const conn = t.closest('[data-connect]');
    if (conn) return onConnect(conn);
    const disc = t.closest('[data-disconnect]');
    if (disc) return onDisconnect(disc);

    if (t.closest('.plan-btn')) return toast('Billing is not set up yet — contact support to change plans.');

    const action = t.closest('[data-action]')?.dataset.action;
    if (action === 'logout') return logout();
    if (action === 'open-password') { $('#user-menu').classList.remove('show'); return $('#pw-modal').classList.add('show'); }
    if (action === 'close-modal' || t.id === 'pw-modal') return $('#pw-modal').classList.remove('show');
  });

  // Keyboard activation for role=button divs
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.chip, .ai-sug')) { e.preventDefault(); e.target.click(); }
    if (e.key === 'Escape') $('#pw-modal').classList.remove('show');
  });
}

/* ── Boot ─────────────────────────────────────────────────────── */
async function boot() {
  initTheme();
  bind();
  checkMobile();
  if (!localStorage.getItem(TOKEN_KEY)) return showAuth();
  try {
    await refreshUser();
    route();
  } catch {
    showAuth();
  }
}

boot();
})();
