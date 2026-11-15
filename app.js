import {
  TYPES, TYPE_KEYS, GENRES, AGES, pack, unpack, CutLinkError, cleanBrief, cleanDj, cleanId, cleanSong, str,
  newBrief, defaultsFor, isDefaultList, sortTimeline, daysUntil, whenLabel, fmtDate, hebDate, waPhone, okUrl, uid,
} from './lib.js';

const app = document.getElementById('app');
const BASE = location.origin + location.pathname;
const BRAND = 'DJ MB'; // default stage name, editable in settings

/* ================= small helpers ================= */

// Storage can be blocked (private browsing, in-app browsers). Never let that break the page.
const store = {
  get(k, d = null) { try { const v = localStorage.getItem('djp:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('djp:' + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem('djp:' + k); } catch { /* ignore */ } },
};

// Builds DOM nodes. Text always goes in as text, never as HTML, so data from links can't inject markup.
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
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
}

function topBar(start, end) {
  return h('header', { class: 'top' }, start, end || null);
}
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
const evOf = d => ({ names: d.names, type: d.type, date: d.date, venue: d.venue });

/* ================= routing ================= */
// #c=...  a client's form link (made by the DJ)
// #b=...  a filled brief coming back to the DJ
// nothing  the DJ's own screens

let routeSeq = 0;
async function route() {
  const my = ++routeSeq;
  C = null;
  const m = /^#([cb])=(.+)$/.exec(location.hash);
  if (!m) return djHome();
  try {
    const payload = await unpack(decodeURIComponent(m[2]));
    if (my !== routeSeq) return;
    if (m[1] === 'c') clientStart(payload);
    else briefFromLink(payload);
  } catch (e) {
    if (my === routeSeq) broken(e instanceof CutLinkError);
  }
}

function goHome() {
  history.replaceState(null, '', BASE);
  C = null;
  djHome();
}

function broken(cut) {
  document.title = 'פרטי האירוע';
  screen(
    topBar(brand('פרטי האירוע')),
    h('div', { class: 'hero' },
      h('h1', null, cut ? 'הקישור נחתך' : 'הקישור לא תקין'),
      h('p', null, cut
        ? 'נראה שהקישור לא הועתק עד הסוף. כדאי לפתוח אותו ישירות מההודעה בוואטסאפ, או לבקש שישלחו אותו שוב.'
        : 'אי אפשר לפתוח את הקישור הזה. אפשר לבקש שישלחו אותו שוב.')),
  );
}

/* ================= DJ side ================= */

function me() {
  const m = store.get('me');
  const d = cleanDj(m);
  return d.n && waPhone(d.p) ? d : null;
}
function events() {
  const e = store.get('events', {});
  return e && typeof e === 'object' && !Array.isArray(e) ? e : {};
}
function saveEvents(all) {
  if (!store.set('events', all)) toast('לא הצלחתי לשמור במכשיר הזה');
}

function djHome() {
  document.title = me()?.n || BRAND;
  if (me()) listScreen();
  else settingsScreen(true);
}

function listScreen() {
  const m = me();
  const all = Object.values(events()).map(e => ({ e, n: daysUntil(e.ev?.date) }));
  const upcoming = all.filter(x => x.n == null || x.n >= 0).sort((a, b) => (a.n ?? 1e9) - (b.n ?? 1e9));
  const past = all.filter(x => x.n != null && x.n < 0).sort((a, b) => b.n - a.n);
  const group = (title, rows) => rows.length ? [
    h('div', { class: 'section-title' }, h('h2', null, title), h('span', { class: 'muted small' }, String(rows.length))),
    h('div', { class: 'events' }, rows.map(eventCard)),
  ] : null;

  screen(
    topBar(brand(m.n), h('button', { class: 'iconbtn', 'aria-label': 'הגדרות', title: 'הגדרות', onclick: () => settingsScreen() }, '⚙')),
    h('div', { class: 'spacer' }),
    h('button', { class: 'btn primary block', onclick: newEventScreen }, '+ אירוע חדש'),
    all.length ? null : h('div', { class: 'empty' }, disc(),
      h('p', null, 'עוד אין אירועים.'),
      h('p', { class: 'small' }, 'יוצרים אירוע, שולחים ללקוחות קישור, והפרטים שהם ממלאים חוזרים אלייך לוואטסאפ.')),
    group('קרובים', upcoming),
    group('עברו', past),
  );
}

function eventCard({ e, n }) {
  const ev = e.ev || {};
  return h('button', { class: 'card ev', onclick: () => (e.d ? briefScreen(e) : shareScreen(e)) },
    h('div', { class: 'date' }, ev.date
      ? [h('b', null, String(Number(ev.date.slice(8)))), h('span', null, monthShort(ev.date))]
      : h('span', null, 'בלי תאריך')),
    h('div', { class: 'info' },
      h('b', null, ev.names || 'בלי שם'),
      h('span', null, [TYPES[ev.type]?.label, whenLabel(n)].filter(Boolean).join(' · '))),
    h('span', { class: 'badge ' + (e.d ? 'ok' : 'wait') }, e.d ? 'התקבל' : 'ממתין'));
}

// One-of-many buttons for the event type.
function typeChips(current, onPick) {
  return h('div', { class: 'chips', role: 'group', 'aria-label': 'סוג האירוע' }, TYPE_KEYS.map(k =>
    h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(current === k),
      onclick: e => {
        for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', 'false');
        e.currentTarget.setAttribute('aria-pressed', 'true');
        onPick(k);
      },
    }, TYPES[k].label)));
}

function newEventScreen() {
  const ev = { names: '', type: '', date: '', venue: '' };
  let phone = '';
  const set = k => e => { ev[k] = e.target.value; };
  const err = h('p', { class: 'small', role: 'alert', style: 'color:var(--bad)' });
  const whoLbl = h('span', { class: 'lbl' }, 'שם האירוע');
  const whoInput = h('input', { type: 'text', placeholder: 'למשל: נועה ואיתי, או יום ההולדת של דנה', oninput: set('names') });
  const chips = typeChips('', t => {
    ev.type = t;
    [whoLbl.textContent, whoInput.placeholder] = TYPES[t].who;
    err.textContent = '';
  });
  screen(
    topBar(backBtn(listScreen)),
    h('h1', null, 'אירוע חדש'),
    h('div', { class: 'spacer' }),
    h('form', {
      class: 'card stack',
      onsubmit: e => {
        e.preventDefault();
        if (!ev.type) {
          err.textContent = 'צריך לבחור איזה אירוע זה';
          chips.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return;
        }
        const id = uid();
        const all = events();
        all[id] = { id, ev: evOf(cleanBrief(ev)), clientPhone: str(phone, 30), created: Date.now() };
        saveEvents(all);
        shareScreen(all[id]);
      },
    },
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'איזה אירוע?'), chips),
    h('label', { class: 'field' }, whoLbl, whoInput),
    h('div', { class: 'grid2' },
      field('תאריך', h('input', { type: 'date', oninput: set('date') })),
      field('מקום', h('input', { type: 'text', placeholder: 'אולם, גן...', oninput: set('venue') }))),
    field('הטלפון של הלקוח', h('input', { type: 'tel', dir: 'ltr', placeholder: '050-0000000', autocomplete: 'off', oninput: e => { phone = e.target.value; } }),
      'לא חובה. אם יש מספר, וואטסאפ ייפתח ישר בצ׳אט הנכון.'),
    err,
    h('button', { class: 'btn primary block', type: 'submit' }, 'יצירת קישור ללקוח')),
  );
}

async function shareScreen(e) {
  const m = me();
  // If the client already sent details, the new link carries them, so the form opens filled in on any phone.
  const link = BASE + '#c=' + await pack({ v: 1, dj: m, id: e.id, ev: e.ev, d: e.d || undefined });
  const to = (TYPES[e.ev.type] || TYPES.other).to;
  const msg = e.d
    ? `היי! כאן ${m.n} 🎧\nאם תרצו לעדכן משהו בפרטי האירוע, זה הקישור. אחרי העדכון פשוט שלחו לי שוב:\n${link}`
    : `היי! כאן ${m.n} 🎧\nכדי שאגיע מוכנה בדיוק ${to} שלכם, אשמח שתמלאו כמה פרטים בקישור. זה לוקח כמה דקות, ממש מהטלפון:\n${link}`;
  const ev = e.ev;
  screen(
    topBar(backBtn(e.d ? () => briefScreen(e) : listScreen)),
    h('h1', null, ev.names || 'אירוע'),
    h('p', { class: 'muted' }, [TYPES[ev.type]?.label, fmtDate(ev.date), ev.venue].filter(Boolean).join(' · ')),
    h('div', { class: 'spacer' }),
    h('div', { class: 'card stack' },
      h('h2', null, e.d ? 'קישור לעדכון הפרטים' : 'הקישור ללקוחות מוכן'),
      h('p', { class: 'muted' }, 'כשהלקוחות ימלאו וישלחו, הפרטים יגיעו אלייך לוואטסאפ. פותחים את הקישור שמגיע, והאירוע נשמר כאן.'),
      h('a', { class: 'btn wa block', href: waLink(e.clientPhone, msg), target: '_blank', rel: 'noopener' }, 'שליחה בוואטסאפ'),
      h('button', { class: 'btn block', onclick: () => copyText(msg, 'ההודעה הועתקה') }, 'העתקת ההודעה'),
      h('a', { class: 'btn ghost block', href: link, target: '_blank', rel: 'noopener' }, 'איך זה נראה אצל הלקוחות')),
    h('div', { class: 'spacer' }),
    deleteBtn(e),
  );
}

function deleteBtn(e) {
  return h('button', {
    class: 'btn ghost danger block noprint',
    onclick: () => {
      if (!confirm('למחוק את האירוע הזה?')) return;
      const all = events();
      delete all[e.id];
      saveEvents(all);
      toast('האירוע נמחק');
      goHome();
    },
  }, 'מחיקת האירוע');
}

function briefScreen(e, opts = {}) {
  const m = me();
  document.title = e.d.names || 'פרטי האירוע';
  const mine = m && !opts.foreign;
  screen(
    topBar(mine ? backBtn(goHome) : brand(e.dj?.n || 'פרטי האירוע'),
      h('button', { class: 'btn small noprint', onclick: () => window.print() }, 'הדפסה')),
    opts.note ? h('p', { class: 'card small' }, opts.note) : null,
    h('div', { class: 'card' }, briefView(e.d)),
    h('div', { class: 'stack noprint', style: 'margin-top:16px' },
      e.ts ? h('p', { class: 'muted small center' }, 'התקבל ' + fmtStamp(e.ts)) : null,
      opts.foreign && !m ? h('div', { class: 'card stack' },
        h('p', null, `זה הטלפון של ${e.dj.n}? אפשר לשמור כאן את האירוע ולראות את כל האירועים במקום אחד.`),
        h('button', { class: 'btn primary block', onclick: () => { store.set('me', e.dj); briefFromLink({ id: e.id, d: e.d, ts: e.ts, dj: e.dj }); } }, 'שמירה באירועים שלי')) : null,
      mine ? h('button', { class: 'btn block', onclick: () => shareScreen(e) }, 'שליחת קישור לעדכון ללקוחות') : null,
      mine ? deleteBtn(e) : null),
  );
}

function briefFromLink(p) {
  const id = cleanId(p?.id);
  if (!id || !p.d) return broken(false);
  const d = cleanBrief(p.d);
  const e = { id, d, ev: evOf(d), ts: Number(p.ts) || Date.now(), dj: cleanDj(p.dj) };
  const m = me();
  if (!m || waPhone(m.p) !== waPhone(e.dj.p)) return briefScreen(e, { foreign: true });

  const all = events();
  const old = all[id];
  if (old?.ts && old.ts > e.ts) {
    return briefScreen(old, { note: 'זה קישור ישן. יש כאן גרסה חדשה יותר של האירוע, והיא זו שמוצגת.' });
  }
  all[id] = { ...old, id, ev: e.ev, d, ts: e.ts, created: old?.created || e.ts, clientPhone: old?.clientPhone || d.contactPhone };
  saveEvents(all);
  if (old?.ts !== e.ts) toast(old?.d ? 'האירוע עודכן' : 'האירוע נשמר אצלך');
  briefScreen(all[id]);
}

function settingsScreen(first = false) {
  const d = { ...(me() || { n: BRAND, p: '' }) };
  const err = h('p', { class: 'small', role: 'alert', style: 'color:var(--bad)' });
  screen(
    first ? topBar(brand(BRAND)) : topBar(backBtn(listScreen)),
    first
      ? h('div', { class: 'hero' }, h('h1', null, 'ברוכה הבאה!'), h('p', null, 'שני פרטים, ואפשר להתחיל לשלוח ללקוחות קישורים למילוי פרטי האירוע.'))
      : h('h1', null, 'הגדרות'),
    h('div', { class: 'spacer' }),
    h('form', {
      class: 'card stack',
      onsubmit: e => {
        e.preventDefault();
        if (!d.n.trim()) { err.textContent = 'צריך למלא שם'; return; }
        if (!waPhone(d.p)) { err.textContent = 'מספר הוואטסאפ לא נראה תקין'; return; }
        if (!store.set('me', cleanDj(d))) { err.textContent = 'הדפדפן לא מאפשר לשמור. אולי זה מצב גלישה בסתר?'; return; }
        if (!first) toast('נשמר');
        listScreen();
      },
    },
    field('השם שלך, כפי שיופיע ללקוחות', h('input', { type: 'text', value: d.n, placeholder: 'למשל: ' + BRAND, autocomplete: 'name', oninput: e => { d.n = e.target.value; } })),
    field('מספר הוואטסאפ שלך', h('input', { type: 'tel', dir: 'ltr', value: d.p, placeholder: '050-0000000', autocomplete: 'tel', oninput: e => { d.p = e.target.value; } }),
      'לכאן יגיעו הפרטים שהלקוחות ממלאים'),
    err,
    h('button', { class: 'btn primary block', type: 'submit' }, first ? 'שמירה והמשך' : 'שמירה')),
    h('div', { class: 'card stack', style: 'margin-top:16px' },
      h('h3', null, first ? 'עברת לטלפון חדש?' : 'גיבוי'),
      h('p', { class: 'muted small' }, first
        ? 'אם יש לך קובץ גיבוי, אפשר לשחזר ממנו את כל האירועים.'
        : 'האירועים נשמרים בדפדפן של המכשיר הזה. כדאי להוסיף את האתר למסך הבית ולהוריד גיבוי מדי פעם. וגם אם משהו הולך לאיבוד, כל אירוע נמצא בקישור ששלחו לך בוואטסאפ.'),
      h('div', { class: 'row' },
        first ? null : h('button', { class: 'btn grow', onclick: downloadBackup }, 'הורדת גיבוי'),
        h('label', { class: 'btn grow' }, 'שחזור מגיבוי',
          h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: restoreBackup })))),
  );
}

function downloadBackup() {
  const data = { app: 'dj-planner', v: 1, at: Date.now(), me: me(), events: events() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `events-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function restoreBackup(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const j = JSON.parse(await file.text());
    if (j?.app !== 'dj-planner' || !j.events || typeof j.events !== 'object') throw new Error('not a backup');
    const all = events();
    let n = 0;
    for (const [id, x] of Object.entries(j.events)) {
      if (!cleanId(id) || !x || typeof x !== 'object') continue;
      const item = { id, ev: evOf(cleanBrief(x.ev)), clientPhone: str(x.clientPhone, 30), created: Number(x.created) || 0 };
      if (x.d) { item.d = cleanBrief(x.d); item.ts = Number(x.ts) || 0; item.ev = evOf(item.d); }
      const old = all[id];
      if (!old || (item.ts || item.created) >= (old.ts || old.created || 0)) { all[id] = item; n++; }
    }
    if (!me() && j.me) store.set('me', cleanDj(j.me));
    saveEvents(all);
    toast(`שוחזרו ${n} אירועים`);
    djHome();
  } catch {
    toast('הקובץ הזה לא נראה כמו גיבוי של האפליקציה');
  }
}

/* ================= the run sheet (shared by DJ and client summary) ================= */

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
      h('div', { class: 'type' }, TYPES[d.type]?.label),
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
  if (parts.length === 1 && !d.date && !place) parts.push(h('p', { class: 'muted', style: 'margin-top:12px' }, 'עוד לא מולאו פרטים.'));
  return h('article', { class: 'brief' }, parts);
}

/* ================= client side ================= */

let C = null; // { id, dj, d, step, sent }
const STEPS = ['פרטים', 'אווירה', 'רגעים', 'שירים', 'לו״ז', 'שליחה'];

function clientStart(p) {
  const id = cleanId(p?.id);
  const dj = cleanDj(p?.dj);
  if (!id || !dj.n) return broken(false);
  const draft = store.get('draft:' + id);
  const d = draft?.d ? cleanBrief(draft.d) : p.d ? cleanBrief(p.d) : newBrief(p.ev);
  const step = Math.min(Math.max(Number(draft?.step) || 0, 0), STEPS.length - 1);
  C = { id, dj, d, step, sent: !!draft?.sent };
  document.title = `פרטי האירוע · ${dj.n}`;
  renderClient();
}

let draftTimer;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraftNow, 400);
}
function saveDraftNow() {
  clearTimeout(draftTimer);
  if (!C) return;
  const ok = store.set('draft:' + C.id, { d: C.d, step: C.step, sent: C.sent, at: Date.now() });
  const el = document.getElementById('savestate');
  if (el) el.textContent = ok ? 'נשמר בטלפון ✓' : '';
}
addEventListener('pagehide', saveDraftNow);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveDraftNow(); });

function go(i) {
  if (C.step === 4) C.d.timeline = sortTimeline(C.d.timeline);
  C.step = i;
  saveDraftNow();
  renderClient();
}

function renderClient() {
  const s = C.step;
  const body = [stepDetails, stepVibe, stepMoments, stepSongs, stepTimeline, stepSend][s]();
  app.replaceChildren(
    h('div', { class: 'wrap' },
      topBar(brand(C.dj.n), h('span', { class: 'savestate', id: 'savestate' })),
      s === 0 ? h('div', { class: 'hero' },
        h('p', { class: 'small', style: 'margin:0 0 6px' }, [TYPES[C.d.type]?.label, C.d.names].filter(Boolean).join(' · ')),
        h('h1', null, 'היי!'),
        h('p', null, `כמה דקות של מילוי, ואני מגיעה מוכנה בדיוק ${(TYPES[C.d.type] || TYPES.other).to} שלכם. הכול נשמר אוטומטית בטלפון, אפשר לעצור ולהמשיך מתי שנוח.`)) : null,
      h('nav', { class: 'steps', 'aria-label': 'שלבים' }, STEPS.map((nm, i) =>
        h('button', { class: i === s ? 'on' : i < s ? 'done' : '', 'aria-label': `שלב ${i + 1}: ${nm}`, 'aria-current': i === s ? 'step' : null, onclick: () => go(i) },
          h('span', { class: 'bar' }), h('span', { class: 'nm' }, nm)))),
      body),
    h('nav', { class: 'bottom' }, h('div', { class: 'in' },
      s > 0 ? h('button', { class: 'btn', onclick: () => go(s - 1) }, 'הקודם') : null,
      s < STEPS.length - 1 ? h('button', { class: 'btn primary', onclick: () => go(s + 1) }, s === STEPS.length - 2 ? 'לסיכום ושליחה' : 'הבא') : null)),
  );
  window.scrollTo(0, 0);
}

// An input bound to one field of an object. Edits save the draft.
function bind(obj, key, attrs = {}, tag = 'input') {
  return h(tag, { ...(tag === 'input' && !attrs.type ? { type: 'text' } : {}), ...attrs, value: obj[key] ?? '', oninput: e => { obj[key] = e.target.value; saveDraft(); } });
}

function stepDetails() {
  const d = C.d;
  const whoLbl = h('span', { class: 'lbl' }, TYPES[d.type].who[0]);
  const whoInput = bind(d, 'names', { placeholder: TYPES[d.type].who[1] });
  const changeType = t => {
    const old = d.type;
    d.type = t;
    // Swap in the new type's moments and timeline, unless the client already changed them.
    if (isDefaultList(d.moments, old, 'moments')) d.moments = defaultsFor(t).moments;
    if (isDefaultList(d.timeline, old, 'timeline')) d.timeline = defaultsFor(t).timeline;
    [whoLbl.textContent, whoInput.placeholder] = TYPES[t].who;
    saveDraft();
  };
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
    field('סוג האירוע', h('select', { value: d.type, oninput: e => changeType(e.target.value) }, TYPE_KEYS.map(k => h('option', { value: k }, TYPES[k].label)))),
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

function stepSend() {
  const d = C.d;
  let msg = '';
  const waBtn = h('a', { class: 'btn wa block', 'aria-disabled': 'true', target: '_blank', rel: 'noopener' }, `שליחה ${withL(C.dj.n)} בוואטסאפ`);
  waBtn.addEventListener('click', () => {
    C.sent = true;
    saveDraftNow();
    setTimeout(() => toast('תודה! אם משהו משתנה, אפשר לעדכן כאן ולשלוח שוב.'), 800);
  });
  const shareBtn = navigator.share ? h('button', { class: 'btn block', onclick: () => msg && navigator.share({ text: msg }).catch(() => {}) }, 'שליחה בדרך אחרת') : null;
  const copyBtn = h('button', { class: 'btn block', onclick: () => msg && copyText(msg, 'ההודעה הועתקה') }, 'העתקת ההודעה');

  // Build the link before any tap, so the WhatsApp button opens straight away (phones block pop-ups opened late).
  pack({ v: 1, dj: C.dj, id: C.id, ts: Date.now(), d }).then(packed => {
    const link = BASE + '#b=' + packed;
    msg = `היי ${C.dj.n}, מילאנו את פרטי האירוע 🎶\n${[TYPES[d.type].label, d.names, fmtDate(d.date)].filter(Boolean).join(' · ')}\n\nכל הפרטים בקישור:\n${link}`;
    waBtn.href = waLink(C.dj.p, msg);
    waBtn.removeAttribute('aria-disabled');
  });

  const missing = [!d.names && 'שמות', !d.date && 'תאריך'].filter(Boolean);
  return h('div', { class: 'stack' },
    h('div', null, h('h2', null, 'הכול מוכן?'),
      h('p', { class: 'muted' }, 'שולחים לי בוואטסאפ בלחיצה. אפשר לחזור ולעדכן מתי שרוצים, ופשוט לשלוח שוב.')),
    missing.length ? h('p', { class: 'card small' }, `חסר: ${missing.join(' ו')}. אפשר לשלוח גם ככה, אבל עדיף להשלים. `,
      h('a', { href: '#', onclick: e => { e.preventDefault(); go(0); } }, 'להשלמה')) : null,
    waBtn, shareBtn, copyBtn,
    C.sent ? h('p', { class: 'muted small center' }, 'כבר שלחתם פעם אחת. שינויים חדשים יגיעו אליי רק אם תשלחו שוב.') : null,
    h('div', { class: 'section-title' }, h('h2', null, 'ככה זה יגיע אליי')),
    h('div', { class: 'card' }, briefView(d)),
  );
}

/* ================= start ================= */

addEventListener('hashchange', route);
route();
