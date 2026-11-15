// The server: stores events, sends the DJ a notification when a client confirms, and serves calendar files.
// Everything that isn't /api/... is the app itself, served from ./public.

import { cleanBrief, cleanId, uid, eventLine, buildIcs, str } from '../public/lib.js';
import { sendPush } from './push.js';

const MAX_BODY = 100_000;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fail = (status, error) => json({ error }, status);

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await api(req, env, ctx, url);
    } catch (e) {
      if (e.status === 413) return fail(413, 'too big');
      console.error(e);
      return fail(500, 'server');
    }
  },
};

async function readJson(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw Object.assign(new Error('too big'), { status: 413 });
  try { return JSON.parse(text); } catch { return null; }
}

async function isAdmin(req, env) {
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_KEY || !got) return false;
  // Compare hashes so the time taken doesn't reveal how much of the key matched.
  const [a, b] = await Promise.all([got, env.ADMIN_KEY].map(s => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const live = (env, id) => env.DB.prepare('SELECT * FROM events WHERE id = ? AND deleted IS NULL').bind(id).first();
const parse = row => (row.data ? cleanBrief(JSON.parse(row.data)) : null);
const djName = env => env.DJ_NAME || 'DJ MB';

async function api(req, env, ctx, url) {
  const path = url.pathname;
  const m = req.method;
  let r;

  if (path === '/api/config' && m === 'GET') {
    return json({ dj: djName(env), vapid: env.VAPID_PUBLIC || '' });
  }

  /* ----- client side: the event id in the link is the only key ----- */

  if ((r = /^\/api\/e\/([a-z0-9]+)$/.exec(path))) {
    const id = cleanId(r[1]);
    const row = id && await live(env, id);
    if (!row) return fail(404, 'not found');
    if (m === 'GET') return json({ dj: djName(env), label: row.label, submitted: row.submitted, data: parse(row) });
    if (m === 'PUT') {
      const body = await readJson(req);
      if (!body || typeof body.data !== 'object') return fail(400, 'bad data');
      const data = cleanBrief(body.data);
      const now = Date.now();
      await env.DB.prepare('UPDATE events SET data = ?, updated = ?, submitted = ? WHERE id = ?')
        .bind(JSON.stringify(data), now, now, id).run();
      const first = !row.submitted;
      ctx.waitUntil(notifyAll(env, url, {
        title: first ? 'אירוע חדש 🎉' : 'עדכון באירוע',
        body: eventLine(data, row.label) || 'פרטים חדשים מלקוח',
        url: `/?ev=${id}`,
        tag: id,
      }));
      return json({ ok: true });
    }
    return fail(405, 'method');
  }

  if ((r = /^\/api\/e\/([a-z0-9]+)\/ics$/.exec(path)) && m === 'GET') {
    const id = cleanId(r[1]);
    const row = id && await live(env, id);
    const d = row && parse(row);
    const ics = d && buildIcs(d, { uid: id, url: `${url.origin}/?ev=${id}`, dj: djName(env) });
    if (!ics) return fail(404, 'no date');
    return new Response(ics, {
      headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': `inline; filename="event-${id.slice(0, 6)}.ics"`, 'cache-control': 'no-store' },
    });
  }

  /* ----- DJ side: needs the admin key ----- */

  if (!path.startsWith('/api/admin/')) return fail(404, 'not found');
  if (!await isAdmin(req, env)) return fail(401, 'unauthorized');

  if (path === '/api/admin/check' && m === 'GET') return json({ ok: true });

  if (path === '/api/admin/events' && m === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, label, created, updated, submitted, data FROM events WHERE deleted IS NULL ORDER BY created DESC').all();
    return json({ events: results.map(row => ({ id: row.id, label: row.label, created: row.created, updated: row.updated, submitted: row.submitted, data: parse(row) })) });
  }

  if (path === '/api/admin/events' && m === 'POST') {
    const body = (await readJson(req)) || {};
    const id = uid();
    const now = Date.now();
    await env.DB.prepare('INSERT INTO events (id, label, created, updated) VALUES (?, ?, ?, ?)').bind(id, str(body.label, 80).trim(), now, now).run();
    return json({ id });
  }

  if ((r = /^\/api\/admin\/events\/([a-z0-9]+)$/.exec(path)) && m === 'DELETE') {
    await env.DB.prepare('UPDATE events SET deleted = ? WHERE id = ?').bind(Date.now(), cleanId(r[1])).run();
    return json({ ok: true });
  }

  if (path === '/api/admin/subscribe' && m === 'POST') {
    const s = await readJson(req);
    const endpoint = s && typeof s.endpoint === 'string' && s.endpoint.startsWith('https://') ? s.endpoint : '';
    const p256dh = str(s?.keys?.p256dh, 200), auth = str(s?.keys?.auth, 100);
    if (!endpoint || !p256dh || !auth) return fail(400, 'bad subscription');
    await env.DB.prepare('INSERT OR REPLACE INTO subs (endpoint, p256dh, auth, created) VALUES (?, ?, ?, ?)').bind(endpoint, p256dh, auth, Date.now()).run();
    return json({ ok: true });
  }

  if (path === '/api/admin/test-push' && m === 'POST') {
    return json(await notifyAll(env, url, { title: 'בדיקה 🎧', body: 'ההתראות עובדות. כך תדעי כשלקוח ממלא פרטים.', url: '/', tag: 'test' }));
  }

  return fail(404, 'not found');
}

// Sends a notification to every registered phone; forgets phones the push service says are gone.
async function notifyAll(env, url, message) {
  if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) return { sent: 0, failed: 0, reason: 'no keys' };
  const vapid = {
    publicKey: env.VAPID_PUBLIC,
    privateKey: env.VAPID_PRIVATE,
    subject: env.VAPID_SUBJECT || (url.protocol === 'https:' ? url.origin : 'mailto:dj-mb@example.org'),
  };
  const { results } = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM subs').all();
  let sent = 0, failed = 0;
  await Promise.all(results.map(async s => {
    try {
      const status = await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, vapid);
      if (status === 404 || status === 410) await env.DB.prepare('DELETE FROM subs WHERE endpoint = ?').bind(s.endpoint).run();
      if (status >= 200 && status < 300) sent++;
      else { failed++; console.warn('push status', status); }
    } catch (e) {
      failed++;
      console.warn('push error', e);
    }
  }));
  return { sent, failed, phones: results.length };
}
