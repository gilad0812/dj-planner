import {
  TYPES, TYPE_KEYS, GENRES, AGES, cleanBrief, cleanId, cleanSong, typeOf, newBrief, defaultsFor, isDefaultList,
  sortTimeline, daysUntil, whenLabel, fmtDate, hebDate, waPhone, okUrl,
} from './lib.js';

const app = document.getElementById('app');
let CONFIG = { dj: 'DJ MB', vapid: '' };

/* ================= small helpers ================= */

// Storage can be blocked (private browsing, in-app browsers). Never let that break the page.
const store = {
  get(k, d = null) { try { const v = localStorage.getItem('djp:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('djp:' + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem('djp:' + k); } catch { /* ignore */ } },
};

// Builds DOM nodes. Text always goes in as text, never as HTML, so client data can't inject markup.
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  if (value !== undefined) el.value = value;
  return el;
}

const DISC = '<svg class="disc" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0E6E6C"/><circle cx="32" cy="32" r="21" fill="#14211F"/><circle cx="32" cy="32" r="15" fill="none" stroke="#2C3B39" stroke-width="1.5"/><circle cx="32" cy="32" r="10" fill="none" stroke="#2C3B39" stroke-width="1.5"/><circle cx="32" cy="32" r="6" fill="#F2A541"/><circle cx="32" cy="32" r="1.6" fill="#14211F"/></svg>';
function disc() { const t = document.createElement('template'); t.innerHTML = DISC; return t.content.firstChild; }

function screen(...nodes) {
  app.replaceChildren(h('div', { class: 'wrap' }, ...nodes));
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
}
const topBar = (start, end) => h('header', { class: 'top' }, start, end || null);
const brand = title => h('div', { class: 'brand' }, disc(), h('span', null, title));
const backBtn = onBack => h('button', { class: 'btn ghost small noprint', onclick: onBack }, '→ חזרה');

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(done);
}

const waLink = (phone, text) => `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`;
const withL = name => (/^[֐-׿]/.test(name) ? 'ל' : 'ל-') + name;
const monthShort = iso => new Intl.DateTimeFormat('he-IL', { month: 'short' }).format(new Date(iso + 'T12:00:00'));
const fmtStamp = ts => new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ts);
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function unb64u(s) {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b + '==='.slice((b.length + 3) % 4)), c => c.charCodeAt(0));
}

/* ================= talking to the server ================= */

class ApiError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

async function api(path, { method = 'GET', body, admin = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (admin) headers.authorization = 'Bearer ' + (store.get('key') || '');
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  } catch {
    throw new ApiError(0, 'offline');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'error');
  return data;
}

function messageScreen(title, text, action) {
  screen(topBar(brand(CONFIG.dj)), h('div', { class: 'hero' }, h('h1', null, title), h('p', null, text)), action || null);
}

/* ================= start ================= */

async function start() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  // A setup link (…#k=CODE) connects this phone as the DJ's.
  const k = /[#&]k=([A-Za-z0-9]{16,64})/.exec(location.hash);
  if (k) { store.set('key', k[1]); history.replaceState(null, '', location.pathname + location.search); }
  try { CONFIG = { ...CONFIG, ...(await api('/config')) }; } catch { /* use the defaults */ }
  const q = new URLSearchParams(location.search);
  const e = cleanId(q.get('e') || '');
  if (q.has('e')) return e ? clientStart(e) : messageScreen('הקישור לא תקין', 'אפשר לבקש שישלחו אותו שוב.');
  djStart(cleanId(q.get('ev') || ''));
}

/* ================= DJ side ================= */

let EVENTS = [];

async function loadEvents() {
  try {
    const { events } = await api('/admin/events', { admin: true });
    EVENTS = events.map(e => ({ ...e, data: e.data ? cleanBrief(e.data) : null }));
    store.set('cache', { at: Date.now(), events: EVENTS });
    return true;
  } catch (err) {
    if (err.status === 401) throw err;
    const c = store.get('cache');
    if (c?.events) EVENTS = c.events.map(e => ({ ...e, data: e.data ? cleanBrief(e.data) : null }));
    toast('אין חיבור לאינטרנט. מוצג המידע האחרון שנשמר.');
    return false;
  }
}

async function djStart(openId) {
  document.title = CONFIG.dj;
  if (!store.get('key')) return connectScreen();
  try {
    await loadEvents();
  } catch {
    store.del('key');
    return connectScreen('הקוד לא נכון או שהוחלף. צריך להזין את הקוד החדש.');
  }
  const e = openId && EVENTS.find(x => x.id === openId);
  if (openId) history.replaceState(null, '', '/');
  if (e) eventScreen(e);
  else listScreen();
}

function connectScreen(error) {
  let code = '';
  const err = h('p', { class: 'small', role: 'alert', style: 'color:var(--bad)' }, error || '');
  screen(
    topBar(brand(CONFIG.dj)),
    h('div', { class: 'hero' }, h('h1', null, 'חיבור הטלפון'),
      h('p', null, 'פעם אחת בלבד: מדביקים כאן את קוד החיבור, וזהו. מכאן האפליקציה תזכור אותו.')),
    h('form', {
      class: 'card stack',
      onsubmit: async ev => {
        ev.preventDefault();
        const c = code.trim().replace(/^.*[#&]k=/, '');
        if (!c) { err.textContent = 'צריך להדביק את הקוד'; return; }
        store.set('key', c);
        try {
          await api('/admin/check', { admin: true });
          djStart();
        } catch (x) {
          store.del('key');
          err.textContent = x.status === 401 ? 'הקוד לא נכון' : 'אין חיבור לאינטרנט. כדאי לנסות שוב.';
        }
      },
    },
    field('קוד החיבור', h('input', { type: 'text', dir: 'ltr', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', oninput: e => { code = e.target.value; } })),
    err,
    h('button', { class: 'btn primary block', type: 'submit' }, 'חיבור')),
  );
}

// The notifications card on the main screen. Returns null when notifications already work.
async function pushCard() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS && !isStandalone()) {
    return h('div', { class: 'card stack notice' },
      h('h3', null, 'כדי לקבל התראות על אירועים חדשים'),
      h('p', { class: 'small' }, 'לוחצים על כפתור השיתוף של ספארי (ריבוע עם חץ), בוחרים "הוספה למסך הבית", ומעכשיו פותחים את DJ MB מהאייקון.'));
  }
  if (!supported || !CONFIG.vapid) return null;
  if (Notification.permission === 'granted') {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      api('/admin/subscribe', { method: 'POST', body: sub.toJSON(), admin: true }).catch(() => {}); // keep the server's copy fresh
      return null;
    }
  }
  if (Notification.permission === 'denied') {
    return h('div', { class: 'card notice' }, h('p', { class: 'small' }, 'ההתראות חסומות. אפשר להפעיל אותן בהגדרות הטלפון, תחת התראות, DJ MB.'));
  }
  const btn = h('button', { class: 'btn primary block', onclick: () => enablePush(btn) }, 'הפעלת התראות');
  return h('div', { class: 'card stack notice' },
    h('h3', null, 'התראה כשלקוח ממלא פרטים'),
    h('p', { class: 'small' }, 'לחיצה אחת, ומכאן הטלפון יודיע על כל אירוע חדש ועל כל עדכון.'),
    btn);
}

async function enablePush(btn) {
  // The permission prompt must come straight from the tap, before anything else is awaited.
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('ההתראות לא אושרו'); return; }
  btn.setAttribute('aria-disabled', 'true');
  btn.textContent = 'מפעיל...';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ||
      await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(CONFIG.vapid) });
    await api('/admin/subscribe', { method: 'POST', body: sub.toJSON(), admin: true });
    await api('/admin/test-push', { method: 'POST', admin: true });
    toast('ההתראות פועלות. עכשיו אמורה להגיע התראת בדיקה.');
    listScreen();
  } catch {
    toast('לא הצלחתי להפעיל התראות. כדאי לנסות שוב.');
    btn.removeAttribute('aria-disabled');
    btn.textContent = 'הפעלת התראות';
  }
}

let refreshing = false;
async function refreshList() {
  if (refreshing) return;
  refreshing = true;
  try { if (await loadEvents()) listScreen(false); } catch { djStart(); } finally { refreshing = false; }
}

let onList = false;
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && onList) refreshList(); });

function listScreen(scrollTop = true) {
  const y = window.scrollY;
  const filled = EVENTS.filter(e => e.submitted && e.data).map(e => ({ e, n: daysUntil(e.data.date) }));
  const waiting = EVENTS.filter(e => !e.submitted || !e.data);
  const upcoming = filled.filter(x => x.n == null || x.n >= 0).sort((a, b) => (a.n ?? 1e9) - (b.n ?? 1e9));
  const past = filled.filter(x => x.n != null && x.n < 0).sort((a, b) => b.n - a.n);
  const group = (title, rows, card) => rows.length ? [
    h('div', { class: 'section-title' }, h('h2', null, title), h('span', { class: 'muted small' }, String(rows.length))),
    h('div', { class: 'events' }, rows.map(card)),
  ] : null;
  const pushSlot = h('div');

  screen(
    topBar(brand(CONFIG.dj), h('button', { class: 'iconbtn', 'aria-label': 'רענון', title: 'רענון', onclick: refreshList }, '⟳')),
    pushSlot,
    h('div', { class: 'spacer' }),
    h('button', { class: 'btn primary block big', onclick: newLinkScreen }, '+ קישור חדש ללקוח'),
    EVENTS.length ? null : h('div', { class: 'empty' }, disc(),
      h('p', null, 'עוד אין אירועים.'),
      h('p', { class: 'small' }, 'שולחים ללקוח קישור, והאירוע מופיע כאן ברגע שהוא ממלא ומאשר.')),
    group('קרובים', upcoming, eventCard),
    group('ממתינים למילוי', waiting, waitingCard),
    group('עברו', past, eventCard),
  );
  onList = true;
  if (!scrollTop) window.scrollTo(0, y);
  pushCard().then(c => c && pushSlot.replaceChildren(c)).catch(() => {});
}

function eventCard({ e, n }) {
  const d = e.data;
  return h('button', { class: 'card ev', onclick: () => eventScreen(e) },
    h('div', { class: 'date' }, d.date
      ? [h('b', null, String(Number(d.date.slice(8)))), h('span', null, monthShort(d.date))]
      : h('span', null, 'בלי תאריך')),
    h('div', { class: 'info' },
      h('b', null, d.names || e.label || 'בלי שם'),
      h('span', null, [d.type ? typeOf(d).label : '', whenLabel(n)].filter(Boolean).join(' · '))),
    e.updated > (store.get('seen:' + e.id) || 0) ? h('span', { class: 'badge ok' }, 'חדש') : null);
}

function waitingCard(e) {
  return h('button', { class: 'card ev', onclick: () => eventScreen(e) },
    h('div', { class: 'info' },
      h('b', null, e.label || 'קישור בלי שם'),
      h('span', null, 'נשלח ' + fmtStamp(e.created))),
    h('span', { class: 'badge wait' }, 'ממתין'));
}

function newLinkScreen() {
  onList = false;
  let label = '';
  const btn = h('button', { class: 'btn primary block big', type: 'submit' }, 'יצירת קישור');
  screen(
    topBar(backBtn(listScreen)),
    h('h1', null, 'קישור חדש ללקוח'),
    h('div', { class: 'spacer' }),
    h('form', {
      class: 'card stack',
      onsubmit: async ev => {
        ev.preventDefault();
        btn.setAttribute('aria-disabled', 'true');
        try {
          const { id } = await api('/admin/events', { method: 'POST', body: { label }, admin: true });
          const e = { id, label: label.trim(), created: Date.now(), updated: Date.now(), submitted: null, data: null };
          EVENTS.unshift(e);
          shareScreen(e);
        } catch {
          toast('אין חיבור לאינטרנט. כדאי לנסות שוב.');
          btn.removeAttribute('aria-disabled');
        }
      },
    },
    field('למי הקישור?', h('input', { type: 'text', placeholder: 'למשל: דנה, יום הולדת', oninput: e => { label = e.target.value; } }),
      'לא חובה. רק כדי לזהות ברשימה עד שימלאו.'),
    btn),
  );
}

function clientLink(id) { return `${location.origin}/?e=${id}`; }
function clientMessage(id) {
  return `היי! כאן ${CONFIG.dj} 🎧\nכדי שאגיע מוכנה בדיוק לאירוע שלכם, אשמח שתמלאו כמה פרטים בקישור. זה לוקח כמה דקות, ממש מהטלפון:\n${clientLink(id)}`;
}

function shareScreen(e) {
  onList = false;
  const msg = clientMessage(e.id);
  screen(
    topBar(backBtn(() => (e.submitted ? eventScreen(e) : listScreen()))),
    h('h1', null, 'הקישור מוכן'),
    e.label ? h('p', { class: 'muted' }, e.label) : null,
    h('div', { class: 'spacer' }),
    h('div', { class: 'card stack' },
      h('p', null, 'שולחים ללקוח. ברגע שימלא ויאשר, תגיע התראה והאירוע יופיע ברשימה.'),
      h('a', { class: 'btn wa block big', href: waLink('', msg), target: '_blank', rel: 'noopener' }, 'שליחה בוואטסאפ'),
      navigator.share ? h('button', { class: 'btn block', onclick: () => navigator.share({ text: msg }).catch(() => {}) }, 'שליחה בדרך אחרת') : null,
      h('button', { class: 'btn block', onclick: () => copyText(clientLink(e.id), 'הקישור הועתק') }, 'העתקת הקישור')),
    h('div', { class: 'spacer' }),
    h('button', { class: 'btn ghost block', onclick: listScreen }, 'סיום'),
  );
}

function eventScreen(e) {
  onList = false;
  if (!e.submitted || !e.data) {
    screen(
      topBar(backBtn(listScreen)),
      h('h1', null, e.label || 'קישור בלי שם'),
      h('p', { class: 'muted' }, 'נשלח ' + fmtStamp(e.created) + '. הלקוח עוד לא מילא ואישר.'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn primary block', onclick: () => shareScreen(e) }, 'שליחת הקישור שוב'),
      h('div', { class: 'spacer' }),
      deleteBtn(e),
    );
    return;
  }
  store.set('seen:' + e.id, e.updated);
  const d = e.data;
  document.title = d.names || CONFIG.dj;
  screen(
    topBar(backBtn(listScreen), h('button', { class: 'btn small noprint', onclick: () => window.print() }, 'הדפסה')),
    d.date ? h('a', { class: 'btn primary block noprint', href: `/api/e/${e.id}/ics`, target: '_blank', rel: 'noopener' }, '📅 הוספה ליומן') : null,
    h('div', { class: 'spacer' }),
    h('div', { class: 'card' }, briefView(d)),
    h('div', { class: 'stack noprint', style: 'margin-top:16px' },
      h('p', { class: 'muted small center' }, 'עודכן לאחרונה ' + fmtStamp(e.submitted)),
      h('button', { class: 'btn block', onclick: () => shareScreen(e) }, 'שליחת הקישור שוב ללקוח'),
      deleteBtn(e)),
  );
}

function deleteBtn(e) {
  return h('button', {
    class: 'btn ghost danger block noprint',
    onclick: async () => {
      if (!confirm('למחוק את האירוע הזה?')) return;
      try {
        await api('/admin/events/' + e.id, { method: 'DELETE', admin: true });
        EVENTS = EVENTS.filter(x => x.id !== e.id);
        toast('האירוע נמחק');
        listScreen();
      } catch {
        toast('אין חיבור לאינטרנט. כדאי לנסות שוב.');
      }
    },
  }, 'מחיקת האירוע');
}

/* ================= the event sheet (DJ's view and the client's summary) ================= */

function briefView(d) {
  const n = daysUntil(d.date);
  const heb = hebDate(d.date);
  const place = [d.venue, d.city].filter(Boolean).join(', ');
  const hours = d.start && d.end ? `${d.start} עד ${d.end}` : d.start ? `מ-${d.start}` : d.end ? `עד ${d.end}` : '';
  const tl = sortTimeline(d.timeline.filter(r => r.time || r.what));
  const moments = d.moments.filter(x => x.label || x.song || x.note);
  const line = (label, ...value) => h('div', null, h('b', null, label + ': '), ...value);
  const section = (title, ...body) => h('section', null, h('h2', null, title), ...body);
  const yt = s => h('a', { class: 'yt', href: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`${s.t} ${s.a}`), target: '_blank', rel: 'noopener' }, '▶ יוטיוב');
  const songs = (list, cls) => h('ul', { class: 'songs ' + (cls || '') }, list.map(s =>
    h('li', null, h('div', { class: 't' }, h('b', null, s.t), s.a ? h('span', null, ' – ' + s.a) : null), yt(s))));
  const playlist = okUrl(d.playlist);
  const tel = d.contactPhone.replace(/[^\d+]/g, '');

  const parts = [
    h('div', { class: 'bhead' },
      d.type ? h('div', { class: 'type' }, typeOf(d).label) : null,
      h('h1', null, d.names || 'בלי שם'),
      n != null ? h('span', { class: 'when' }, whenLabel(n)) : null,
      h('div', { class: 'meta' },
        d.date ? line('תאריך', fmtDate(d.date), heb ? ` · ${heb}` : '') : null,
        hours ? line('שעות', hours) : null,
        place ? line('מקום', place, ' ', h('a', { class: 'yt', href: 'https://waze.com/ul?navigate=yes&q=' + encodeURIComponent(place), target: '_blank', rel: 'noopener' }, 'ניווט בוויז')) : null,
        d.guests || d.ages ? line('אורחים', [d.guests, AGES[d.ages]].filter(Boolean).join(' · ')) : null)),
  ];
  if (d.contactName || d.contactPhone) {
    parts.push(section('קשר ביום האירוע', h('div', { class: 'contact' },
      h('div', { class: 'who' }, d.contactName, d.contactName && d.contactPhone ? ' · ' : '', d.contactPhone ? h('span', { class: 'ltr' }, d.contactPhone) : null),
      tel ? h('a', { class: 'btn small noprint', href: 'tel:' + tel }, 'התקשרות') : null,
      waPhone(d.contactPhone) ? h('a', { class: 'btn small noprint', href: waLink(d.contactPhone, ''), target: '_blank', rel: 'noopener' }, 'וואטסאפ') : null)));
  }
  if (tl.length) {
    parts.push(section('לו״ז', h('table', { class: 'tltable' }, h('tbody', null, tl.map(r =>
      h('tr', null, h('td', { class: 'tm' }, r.time), h('td', null, r.what)))))));
  }
  if (moments.length) {
    parts.push(section('רגעים', moments.map(x => h('div', { class: 'mom' },
      h('div', { class: 'lbl' }, x.label || 'רגע'),
      x.song ? h('div', { class: 'song' }, x.song.t, x.song.a ? ` – ${x.song.a}` : '', ' ', yt(x.song)) : h('div', { class: 'muted small' }, 'לא נבחר שיר'),
      x.note ? h('div', { class: 'note' }, x.note) : null))));
  }
  if (d.must.length) parts.push(section(`חייבים לשמוע (${d.must.length})`, songs(d.must)));
  if (d.nice.length) parts.push(section(`אם יש זמן (${d.nice.length})`, songs(d.nice)));
  if (d.no.length) parts.push(section(`בבקשה בלי (${d.no.length})`, songs(d.no, 'nolist')));
  if (d.genres.length || d.vibe || d.avoid || playlist) {
    parts.push(section('מוזיקה ואווירה',
      d.genres.length ? h('div', { class: 'chips' }, d.genres.map(g => h('span', { class: 'tag' }, g))) : null,
      d.vibe ? h('p', { class: 'prewrap', style: 'margin-top:10px' }, d.vibe) : null,
      d.avoid ? h('p', { style: 'margin-top:8px' }, h('b', null, 'לא מתאים: '), d.avoid) : null,
      playlist ? h('p', { style: 'margin-top:8px' }, h('a', { href: playlist, target: '_blank', rel: 'noopener' }, 'פתיחת הפלייליסט'), ' ', h('span', { class: 'muted small ltr' }, new URL(playlist).hostname)) : null));
  }
  if (d.notes) parts.push(section('הערות', h('p', { class: 'prewrap' }, d.notes)));
  return h('article', { class: 'brief' }, parts);
}

/* ================= client side ================= */

let C = null; // { id, d, step, submitted }
const STEPS = ['פרטים', 'אווירה', 'רגעים', 'שירים', 'לו״ז', 'אישור'];

async function clientStart(id) {
  document.title = `פרטי האירוע · ${CONFIG.dj}`;
  let res;
  try {
    res = await api('/e/' + id);
  } catch (err) {
    if (err.status === 404) return messageScreen('הקישור לא נמצא', `ייתכן שהקישור הועתק חלקית. אפשר לבקש ${withL(CONFIG.dj)} לשלוח אותו שוב.`);
    return messageScreen('אין חיבור', 'צריך חיבור לאינטרנט כדי למלא את הפרטים.', h('button', { class: 'btn primary block', onclick: () => clientStart(id) }, 'לנסות שוב'));
  }
  const draft = store.get('draft:' + id);
  const useDraft = draft?.d && (!res.submitted || (draft.at || 0) > res.submitted);
  const d = useDraft ? cleanBrief(draft.d) : res.data ? cleanBrief(res.data) : newBrief({ names: '' });
  const step = useDraft ? Math.min(Math.max(Number(draft.step) || 0, 0), STEPS.length - 1) : 0;
  C = { id, d, step, submitted: res.submitted };
  renderClient();
}

let draftTimer;
function saveDraft() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraftNow, 400); }
function saveDraftNow() {
  clearTimeout(draftTimer);
  if (!C) return;
  const ok = store.set('draft:' + C.id, { d: C.d, step: C.step, at: Date.now() });
  const el = document.getElementById('savestate');
  if (el) el.textContent = ok ? 'נשמר בטלפון ✓' : '';
}
addEventListener('pagehide', saveDraftNow);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveDraftNow(); });

function go(i) {
  if (C.step === 0 && i > 0 && !C.d.type) {
    toast('צריך לבחור איזה אירוע זה');
    document.querySelector('.chips')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  if (C.step === 4) C.d.timeline = sortTimeline(C.d.timeline);
  C.step = i;
  saveDraftNow();
  renderClient();
}

function renderClient() {
  const s = C.step;
  const body = [stepDetails, stepVibe, stepMoments, stepSongs, stepTimeline, stepConfirm][s]();
  app.replaceChildren(
    h('div', { class: 'wrap' },
      topBar(brand(CONFIG.dj), h('span', { class: 'savestate', id: 'savestate' })),
      s === 0 ? h('div', { class: 'hero' },
        h('h1', null, 'היי!'),
        h('p', null, 'כמה דקות של מילוי, ואני מגיעה מוכנה בדיוק לאירוע שלכם. הכול נשמר אוטומטית בטלפון, אפשר לעצור ולהמשיך מתי שנוח.')) : null,
      h('nav', { class: 'steps', 'aria-label': 'שלבים' }, STEPS.map((nm, i) =>
        h('button', { class: i === s ? 'on' : i < s ? 'done' : '', 'aria-label': `שלב ${i + 1}: ${nm}`, 'aria-current': i === s ? 'step' : null, onclick: () => go(i) },
          h('span', { class: 'bar' }), h('span', { class: 'nm' }, nm)))),
      body),
    s < STEPS.length - 1 ? h('nav', { class: 'bottom' }, h('div', { class: 'in' },
      s > 0 ? h('button', { class: 'btn', onclick: () => go(s - 1) }, 'הקודם') : null,
      h('button', { class: 'btn primary', onclick: () => go(s + 1) }, s === STEPS.length - 2 ? 'לסיכום ואישור' : 'הבא'))) : null,
  );
  window.scrollTo(0, 0);
}

// An input bound to one field of an object. Edits save the draft.
function bind(obj, key, attrs = {}, tag = 'input') {
  return h(tag, { ...(tag === 'input' && !attrs.type ? { type: 'text' } : {}), ...attrs, value: obj[key] ?? '', oninput: e => { obj[key] = e.target.value; saveDraft(); } });
}

function stepDetails() {
  const d = C.d;
  const whoLbl = h('span', { class: 'lbl' }, d.type ? typeOf(d).who[0] : 'שם האירוע או בעלי השמחה');
  const whoInput = bind(d, 'names', { placeholder: d.type ? typeOf(d).who[1] : 'למשל: נועה ואיתי' });
  const typeChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'סוג האירוע' }, TYPE_KEYS.map(k =>
    h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(d.type === k),
      onclick: e => {
        const old = d.type;
        d.type = k;
        // Swap in the new type's moments and timeline, unless the client already changed them.
        if (isDefaultList(d.moments, old, 'moments')) d.moments = defaultsFor(k).moments;
        if (isDefaultList(d.timeline, old, 'timeline')) d.timeline = defaultsFor(k).timeline;
        [whoLbl.textContent, whoInput.placeholder] = TYPES[k].who;
        for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', 'false');
        e.currentTarget.setAttribute('aria-pressed', 'true');
        saveDraft();
      },
    }, TYPES[k].label)));
  const ageChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'גילאי הקהל' }, Object.entries(AGES).map(([k, label]) =>
    h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(d.ages === k),
      onclick: e => {
        d.ages = d.ages === k ? '' : k;
        for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', 'false');
        if (d.ages) e.currentTarget.setAttribute('aria-pressed', 'true');
        saveDraft();
      },
    }, label)));
  return h('div', { class: 'stack' },
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'איזה אירוע?'), typeChips),
    h('label', { class: 'field' }, whoLbl, whoInput),
    field('תאריך', bind(d, 'date', { type: 'date' })),
    h('div', { class: 'grid2' }, field('שעת התחלה', bind(d, 'start', { type: 'time' })), field('שעת סיום', bind(d, 'end', { type: 'time' }))),
    field('מקום האירוע', bind(d, 'venue', { placeholder: 'שם האולם, הגן או המקום' })),
    h('div', { class: 'grid2' }, field('עיר', bind(d, 'city')), field('כמה אורחים בערך?', bind(d, 'guests', { type: 'number', inputmode: 'numeric', min: 0 }))),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'גילאי הקהל'), ageChips),
    h('div', { class: 'card stack' },
      h('h3', null, 'מי איתי בקשר ביום האירוע?'),
      h('div', { class: 'grid2' },
        field('שם', bind(d, 'contactName', { autocomplete: 'name' })),
        field('טלפון', bind(d, 'contactPhone', { type: 'tel', dir: 'ltr', autocomplete: 'tel', placeholder: '050-0000000' })))),
  );
}

function stepVibe() {
  const d = C.d;
  const options = [...GENRES, ...d.genres.filter(g => !GENRES.includes(g))];
  return h('div', { class: 'stack' },
    h('div', null, h('h2', null, 'איזו מוזיקה אתם אוהבים?'), h('p', { class: 'muted' }, 'אפשר לבחור כמה שרוצים.')),
    h('div', { class: 'chips', role: 'group', 'aria-label': 'סגנונות' }, options.map(g =>
      h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(d.genres.includes(g)),
        onclick: e => {
          const i = d.genres.indexOf(g);
          if (i >= 0) d.genres.splice(i, 1); else d.genres.push(g);
          e.currentTarget.setAttribute('aria-pressed', String(i < 0));
          saveDraft();
        },
      }, g))),
    field('ספרו לי על האווירה שאתם רוצים', bind(d, 'vibe', { placeholder: 'למשל: רחבה מפוצצת מההתחלה, או ערב רגוע שמתחמם לאט' }, 'textarea')),
    field('יש סגנון שממש לא מתאים לכם?', bind(d, 'avoid', { placeholder: 'למשל: בלי טראנס' })),
  );
}

function songPicker({ onPick, single = false }) {
  const input = h('input', { type: 'text', placeholder: 'חיפוש שיר או אמן', autocomplete: 'off', enterkeyhint: 'done', 'aria-label': 'חיפוש שיר או אמן', 'aria-expanded': 'false' });
  const listEl = h('div', { class: 'sp-list', role: 'listbox' });
  let timer, ctrl, seq = 0;
  const close = () => { listEl.replaceChildren(); input.setAttribute('aria-expanded', 'false'); };
  const keep = e => e.preventDefault(); // keeps focus in the input while tapping a suggestion
  const pick = s => {
    const c = cleanSong(s);
    if (!c) return;
    seq++; ctrl?.abort(); clearTimeout(timer);
    input.value = '';
    close();
    onPick(c);
  };
  const free = q => h('button', { type: 'button', class: 'sp-item free', onmousedown: keep, onclick: () => pick({ t: q }) }, `להוסיף כמו שכתוב: "${q}"`);
  async function search(q) {
    const my = ++seq;
    ctrl?.abort();
    ctrl = new AbortController();
    input.setAttribute('aria-expanded', 'true');
    listEl.replaceChildren(h('div', { class: 'sp-status' }, 'מחפש...'), free(q));
    try {
      const r = await fetch('https://itunes.apple.com/search?media=music&entity=song&limit=12&country=IL&term=' + encodeURIComponent(q), { signal: ctrl.signal });
      const j = await r.json();
      if (my !== seq) return;
      const seen = new Set();
      const items = [];
      for (const x of j.results || []) {
        const s = cleanSong({ t: x.trackName, a: x.artistName });
        const k = s && (s.t + '|' + s.a).toLowerCase();
        if (!s || seen.has(k)) continue;
        seen.add(k);
        items.push(s);
        if (items.length === 6) break;
      }
      listEl.replaceChildren(...items.map(s => h('button', { type: 'button', class: 'sp-item', role: 'option', onmousedown: keep, onclick: () => pick(s) },
        h('b', null, s.t), h('span', null, s.a))), free(q));
    } catch (e) {
      if (e.name !== 'AbortError' && my === seq) listEl.replaceChildren(free(q));
    }
  }
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { seq++; ctrl?.abort(); close(); return; }
    timer = setTimeout(() => search(q), 300);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const q = input.value.trim(); if (q) pick({ t: q }); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(() => {
    if (listEl.contains(document.activeElement)) return;
    close();
    // For a single song slot, text typed and left behind counts as the choice.
    if (single && input.value.trim()) pick({ t: input.value.trim() });
  }, 200));
  return h('div', { class: 'sp' },
    h('div', { class: 'sp-row' }, input,
      single ? null : h('button', { type: 'button', class: 'btn small', onmousedown: keep, onclick: () => { const q = input.value.trim(); if (q) pick({ t: q }); else input.focus(); } }, 'הוספה')),
    listEl);
}

function stepMoments() {
  const d = C.d;
  const box = h('div', { class: 'stack' });
  const draw = () => box.replaceChildren(...d.moments.map((m, i) => h('div', { class: 'card moment' },
    h('div', { class: 'head' },
      h('input', { type: 'text', value: m.label, placeholder: 'שם הרגע', 'aria-label': 'שם הרגע', oninput: e => { m.label = e.target.value; saveDraft(); } }),
      h('button', {
        class: 'iconbtn bare', 'aria-label': 'הסרת הרגע',
        onclick: () => {
          if ((m.song || m.note) && !confirm('להסיר את הרגע הזה?')) return;
          d.moments.splice(i, 1); draw(); saveDraft();
        },
      }, '✕')),
    m.song
      ? h('div', { class: 'picked' },
        h('div', { class: 't' }, h('b', null, m.song.t), m.song.a ? h('span', null, m.song.a) : null),
        h('button', { class: 'iconbtn bare', 'aria-label': 'החלפת השיר', onclick: () => { m.song = null; draw(); saveDraft(); } }, '✕'))
      : songPicker({ single: true, onPick: s => { m.song = s; draw(); saveDraft(); } }),
    h('textarea', { rows: 1, placeholder: 'הערה (לא חובה)', 'aria-label': 'הערה', value: m.note, oninput: e => { m.note = e.target.value; saveDraft(); } }))));
  draw();
  return h('div', { class: 'stack' },
    h('div', null, h('h2', null, 'הרגעים הגדולים'), h('p', { class: 'muted' }, 'לכל רגע אפשר לבחור שיר ולהוסיף הערה. לא בטוחים? השאירו ריק ונסגור את זה יחד.')),
    box,
    h('button', {
      class: 'add',
      onclick: () => {
        if (d.moments.length >= 30) return toast('אפשר עד 30 רגעים');
        d.moments.push({ label: '', song: null, note: '' });
        draw(); saveDraft();
        box.lastChild?.querySelector('input')?.focus();
      },
    }, '+ הוספת רגע'),
  );
}

function songListCard(title, sub, arr) {
  const ul = h('ul', { class: 'songs' });
  const draw = () => ul.replaceChildren(...arr.map((s, i) => h('li', null,
    h('div', { class: 't' }, h('b', null, s.t), s.a ? h('span', null, ' – ' + s.a) : null),
    h('button', { class: 'iconbtn bare', 'aria-label': 'הסרה', onclick: () => { arr.splice(i, 1); draw(); saveDraft(); } }, '✕'))));
  draw();
  return h('div', { class: 'card' },
    h('h3', null, title), h('p', { class: 'muted small' }, sub), h('div', { class: 'spacer' }),
    songPicker({ onPick: s => { if (arr.length >= 100) return toast('אפשר עד 100 שירים ברשימה'); arr.push(s); draw(); saveDraft(); } }),
    ul);
}

function stepSongs() {
  const d = C.d;
  return h('div', { class: 'stack' },
    h('div', null, h('h2', null, 'שירים'), h('p', { class: 'muted' }, 'מחפשים שיר או אמן ובוחרים מהרשימה, או פשוט כותבים ולוחצים "הוספה".')),
    songListCard('חייבים לשמוע', 'שירים שבלעדיהם זה לא האירוע שלכם', d.must),
    songListCard('אם יש זמן', 'שירים שיהיה כיף לשמוע', d.nice),
    songListCard('בבקשה בלי', 'שירים שאתם לא רוצים לשמוע בכלל', d.no),
    h('div', { class: 'card' }, field('יש לכם פלייליסט?', bind(d, 'playlist', { type: 'url', dir: 'ltr', inputmode: 'url', placeholder: 'https://' }),
      'מדביקים קישור מספוטיפיי, יוטיוב או אפל מיוזיק')),
  );
}

function stepTimeline() {
  const d = C.d;
  const box = h('div', { class: 'tl' });
  const draw = () => box.replaceChildren(...d.timeline.map((r, i) => h('div', { class: 'tl-row' },
    h('input', { type: 'time', value: r.time, 'aria-label': 'שעה', oninput: e => { r.time = e.target.value; saveDraft(); } }),
    h('input', { type: 'text', value: r.what, placeholder: 'מה קורה', 'aria-label': 'מה קורה', oninput: e => { r.what = e.target.value; saveDraft(); } }),
    h('button', { class: 'iconbtn bare', 'aria-label': 'הסרת השורה', onclick: () => { d.timeline.splice(i, 1); draw(); saveDraft(); } }, '✕'))));
  draw();
  return h('div', { class: 'stack' },
    h('div', null, h('h2', null, 'לוח הזמנים'), h('p', { class: 'muted' }, 'הלו״ז המשוער של הערב. אפשר לשנות, להוסיף ולמחוק.')),
    box,
    h('button', {
      class: 'add',
      onclick: () => {
        if (d.timeline.length >= 40) return toast('אפשר עד 40 שורות');
        d.timeline.push({ time: '', what: '' });
        draw(); saveDraft();
        box.lastChild?.querySelector('input')?.focus();
      },
    }, '+ הוספת שורה'),
    field('עוד משהו שחשוב שאדע?', bind(C.d, 'notes', { placeholder: 'נאומים, הפתעות, ריקוד מתוכנן, הגבלות רעש במקום...' }, 'textarea')),
  );
}

function stepConfirm() {
  const d = C.d;
  const missing = [!d.type && 'סוג האירוע', !d.date && 'תאריך'].filter(Boolean);
  const btn = h('button', {
    class: 'btn primary block big',
    'aria-disabled': missing.length ? 'true' : null,
    onclick: async () => {
      btn.setAttribute('aria-disabled', 'true');
      btn.textContent = 'שולח...';
      try {
        await api('/e/' + C.id, { method: 'PUT', body: { data: d } });
        C.submitted = Date.now();
        store.set('draft:' + C.id, { d, step: C.step, at: C.submitted });
        thanksScreen();
      } catch {
        toast('לא הצלחנו לשלוח. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.');
        btn.removeAttribute('aria-disabled');
        btn.textContent = `אישור ושליחה ${withL(CONFIG.dj)}`;
      }
    },
  }, `אישור ושליחה ${withL(CONFIG.dj)}`);
  return h('div', { class: 'stack' },
    h('div', null, h('h2', null, 'הכול נכון?'),
      h('p', { class: 'muted' }, C.submitted
        ? 'כבר שלחתם את הפרטים. אם שיניתם משהו, מאשרים שוב והעדכון יגיע אליי.'
        : 'בודקים שהכול נכון ומאשרים. אפשר לחזור לקישור ולעדכן גם אחר כך.')),
    missing.length ? h('p', { class: 'card small' }, `כדי לשלוח חסר: ${missing.join(' ו')}. `,
      h('a', { href: '#', onclick: e => { e.preventDefault(); C.step = 0; renderClient(); } }, 'להשלמה')) : null,
    btn,
    h('div', { class: 'section-title' }, h('h2', null, 'ככה זה יגיע אליי')),
    h('div', { class: 'card' }, briefView(d)),
    h('button', { class: 'btn block', onclick: () => go(C.step - 1) }, 'הקודם'),
  );
}

function thanksScreen() {
  screen(
    topBar(brand(CONFIG.dj)),
    h('div', { class: 'hero center' },
      h('div', { style: 'font-size:56px;line-height:1' }, '🎉'),
      h('h1', { style: 'margin-top:12px' }, 'תודה!'),
      h('p', null, `הפרטים נשלחו ${withL(CONFIG.dj)}.`),
      h('p', null, 'אם משהו משתנה, פשוט פותחים שוב את אותו קישור, מעדכנים ומאשרים.')),
    h('div', { class: 'spacer' }),
    h('button', { class: 'btn block', onclick: () => { C.step = 0; renderClient(); } }, 'חזרה לפרטים'),
  );
}

start();
