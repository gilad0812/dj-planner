// Pure helpers shared by the app and the tests. No DOM access in this file.

// Every kind of event the DJ plays. For each one:
//   label     what it's called
//   to        "to the ..." phrase, as in "so I arrive ready for your ___"
//   who       the label and example for the "whose event is it" field
//   moments   the key moments the client is asked to pick songs for
//   timeline  a typical run of the evening, which the client edits
const COUPLE = ['שמות בני הזוג', 'למשל: נועה ואיתי'];
export const TYPES = {
  wedding: {
    label: 'חתונה', to: 'לחתונה', who: COUPLE,
    moments: ['קבלת פנים', 'כניסת החתן לחופה', 'כניסת הכלה לחופה', 'שבירת הכוס', 'כניסה לרחבה', 'ריקוד ראשון', 'שיר סיום'],
    timeline: [['19:30', 'קבלת פנים'], ['20:30', 'חופה'], ['21:00', 'כניסה לאולם'], ['21:15', 'מנה ראשונה'],
      ['21:45', 'סט ריקודים ראשון'], ['22:30', 'מנה עיקרית'], ['23:00', 'סט ריקודים שני'], ['00:30', 'סיום']],
  },
  henna: {
    label: 'חינה', to: 'לחינה', who: COUPLE,
    moments: ['כניסת החתן והכלה', 'טקס החינה', 'כניסה לרחבה', 'שיר סיום'],
    timeline: [['20:00', 'קבלת פנים'], ['21:00', 'טקס החינה'], ['21:45', 'ארוחה'], ['22:15', 'ריקודים'], ['00:00', 'סיום']],
  },
  engagement: {
    label: 'אירוסין', to: 'לאירוסין', who: COUPLE,
    moments: ['כניסת בני הזוג', 'רגע הטבעת', 'כניסה לרחבה', 'שיר סיום'],
    timeline: [['20:00', 'קבלת פנים'], ['21:00', 'ברכות'], ['21:30', 'ריקודים'], ['23:30', 'סיום']],
  },
  bar: {
    label: 'בר מצווה', to: 'לבר המצווה', who: ['שם בר המצווה', 'למשל: יונתן כהן'],
    moments: ['כניסת בר המצווה', 'הדלקת נרות', 'ריקוד עם ההורים', 'כניסה לרחבה', 'שיר סיום'],
    timeline: [['19:30', 'קבלת פנים'], ['20:30', 'כניסה לאולם'], ['20:45', 'הדלקת נרות'], ['21:15', 'ארוחה'],
      ['21:45', 'ריקודים'], ['23:30', 'סיום']],
  },
  bat: {
    label: 'בת מצווה', to: 'לבת המצווה', who: ['שם בת המצווה', 'למשל: מאיה לוי'],
    moments: ['כניסת בת המצווה', 'הדלקת נרות', 'ריקוד עם ההורים', 'כניסה לרחבה', 'שיר סיום'],
    timeline: [['19:30', 'קבלת פנים'], ['20:30', 'כניסה לאולם'], ['20:45', 'הדלקת נרות'], ['21:15', 'ארוחה'],
      ['21:45', 'ריקודים'], ['23:30', 'סיום']],
  },
  brit: {
    label: 'ברית / בריתה', to: 'לברית', who: ['שם המשפחה', 'למשל: משפחת לוי'],
    moments: ['כניסת הרך הנולד', 'ברכות ונאומים', 'שיר סיום'],
    timeline: [['10:00', 'קבלת פנים'], ['10:45', 'טקס'], ['11:15', 'ארוחה'], ['12:30', 'סיום']],
  },
  birthday: {
    label: 'יום הולדת', to: 'ליום ההולדת', who: ['של מי יום ההולדת?', 'למשל: דנה, 40'],
    moments: ['כניסת בעלי השמחה', 'עוגה ונרות', 'כניסה לרחבה', 'שיר סיום'],
    timeline: [['20:00', 'קבלת פנים'], ['21:00', 'ריקודים'], ['22:00', 'עוגה ונרות'], ['23:30', 'סיום']],
  },
  bachelor: {
    label: 'מסיבת רווקים/ות', to: 'למסיבה', who: ['של מי המסיבה?', 'למשל: הרווקות של שירה'],
    moments: ['כניסת החתן או הכלה', 'הפתעה מהחברים', 'כניסה לרחבה', 'שיר סיום'],
    timeline: [['21:00', 'התכנסות'], ['22:00', 'ריקודים'], ['01:00', 'סיום']],
  },
  school: {
    label: 'מסיבת סיום', to: 'למסיבה', who: ['שם בית הספר או השכבה', 'למשל: שכבת י״ב, תיכון הדרים'],
    moments: ['כניסת המחזור', 'טקס ונאומים', 'כניסה לרחבה', 'שיר סיום'],
    timeline: [['19:00', 'התכנסות'], ['19:30', 'טקס'], ['20:30', 'ריקודים'], ['23:00', 'סיום']],
  },
  corporate: {
    label: 'אירוע חברה', to: 'לאירוע', who: ['שם החברה או האירוע', 'למשל: הרמת כוסית של חברת אלפא'],
    moments: ['פתיחת האירוע', 'נאומים ועלייה לבמה', 'כניסה לרחבה', 'שיר סיום'],
    timeline: [['19:00', 'קבלת פנים'], ['20:00', 'נאומים'], ['20:30', 'ארוחה'], ['21:15', 'ריקודים'], ['23:00', 'סיום']],
  },
  private: {
    label: 'מסיבה פרטית', to: 'למסיבה', who: ['שם האירוע', 'למשל: מסיבת גג אצל רון'],
    moments: ['פתיחה', 'כניסה לרחבה', 'שיר סיום'],
    timeline: [['21:00', 'התכנסות'], ['22:00', 'ריקודים'], ['01:00', 'סיום']],
  },
  other: {
    label: 'אחר', to: 'לאירוע', who: ['שם האירוע', 'למשל: ערב גיבוש'],
    moments: ['פתיחה', 'כניסה לרחבה', 'שיר סיום'],
    timeline: [['20:00', 'קבלת פנים'], ['21:00', 'ריקודים'], ['23:30', 'סיום']],
  },
};
export const TYPE_KEYS = Object.keys(TYPES);

export const GENRES = ['מזרחית', 'פופ ישראלי', 'רוק ישראלי', 'שירי ארץ ישראל', 'להיטים לועזיים', 'שנות ה-80',
  'שנות ה-90 וה-2000', 'היפ הופ', 'אלקטרוני והאוס', 'לטיני', 'יווני וים תיכוני', 'חסידי', 'ערבית', 'סלואו'];

export const AGES = { young: 'צעירים ברובם', mixed: 'מעורב', older: 'מבוגרים ברובם' };

/* ---------- packing data into a link ---------- */

const enc = new TextEncoder();
const dec = new TextDecoder();
// Last character of every packed value. If a chat app cuts the link short, the marker is gone and we can say so.
const END = 'E';

export function toB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad link');
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '==='.slice((b.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function through(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function pack(obj) {
  const bytes = enc.encode(JSON.stringify(obj));
  try {
    return 'z' + toB64url(await through(bytes, new CompressionStream('deflate-raw'))) + END;
  } catch {
    return 'j' + toB64url(bytes) + END;
  }
}

export class CutLinkError extends Error {}

export async function unpack(str) {
  str = String(str || '').trim();
  if (!str.endsWith(END)) throw new CutLinkError('link cut short');
  const kind = str[0];
  const body = fromB64url(str.slice(1, -1));
  let bytes;
  if (kind === 'z') bytes = await through(body, new DecompressionStream('deflate-raw'));
  else if (kind === 'j') bytes = body;
  else throw new Error('bad link');
  return JSON.parse(dec.decode(bytes));
}

/* ---------- cleaning data that arrives from a link ---------- */

export function str(v, max) {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
  return typeof v === 'string' ? v.slice(0, max) : '';
}
const time = v => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : '');
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

export function cleanSong(v) {
  const s = typeof v === 'string' ? { t: v } : v && typeof v === 'object' ? v : {};
  const t = str(s.t, 150).trim();
  return t ? { t, a: str(s.a, 150).trim() } : null;
}

export function cleanDj(v) {
  const o = v && typeof v === 'object' ? v : {};
  return { n: str(o.n, 60).trim(), p: str(o.p, 30).trim() };
}

export function cleanId(v) {
  return typeof v === 'string' && /^[a-z0-9]{4,16}$/.test(v) ? v : '';
}

export function cleanBrief(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const songs = v => list(v, 100).map(cleanSong).filter(Boolean);
  return {
    names: str(r.names, 120),
    type: TYPES[r.type] ? r.type : 'other',
    date: typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : '',
    start: time(r.start),
    end: time(r.end),
    venue: str(r.venue, 120),
    city: str(r.city, 60),
    guests: str(r.guests, 10),
    ages: AGES[r.ages] ? r.ages : '',
    contactName: str(r.contactName, 80),
    contactPhone: str(r.contactPhone, 30),
    genres: list(r.genres, 30).map(g => str(g, 40)).filter(Boolean),
    vibe: str(r.vibe, 2000),
    avoid: str(r.avoid, 300),
    moments: list(r.moments, 30).map(m => {
      const o = m && typeof m === 'object' ? m : {};
      return { label: str(o.label, 80), song: cleanSong(o.song), note: str(o.note, 500) };
    }),
    must: songs(r.must),
    nice: songs(r.nice),
    no: songs(r.no),
    playlist: str(r.playlist, 500),
    timeline: list(r.timeline, 40).map(t => {
      const o = t && typeof t === 'object' ? t : {};
      return { time: time(o.time), what: str(o.what, 120) };
    }),
    notes: str(r.notes, 3000),
  };
}

/* ---------- defaults per event type ---------- */

export function defaultsFor(type) {
  const t = TYPES[type] || TYPES.other;
  return {
    moments: t.moments.map(label => ({ label, song: null, note: '' })),
    timeline: t.timeline.map(([tm, what]) => ({ time: tm, what })),
  };
}

export function newBrief(ev) {
  const e = ev && typeof ev === 'object' ? ev : {};
  const type = TYPES[e.type] ? e.type : 'other';
  return cleanBrief({ ...e, type, ...defaultsFor(type) });
}

// True when the client has not touched the default moments (or timeline) of this event type,
// so switching the type can safely swap in the new type's defaults.
export function isDefaultList(rows, type, kind) {
  const def = defaultsFor(type)[kind];
  if (rows.length !== def.length) return false;
  if (kind === 'moments') return rows.every((m, i) => m.label === def[i].label && !m.song && !m.note);
  return rows.every((r, i) => r.time === def[i].time && r.what === def[i].what);
}

/* ---------- formatting ---------- */

// Evening events run past midnight, so 00:00 to 05:59 sorts after the evening.
export function sortTimeline(rows) {
  const key = r => {
    if (!r.time) return Infinity;
    const [hh, mm] = r.time.split(':').map(Number);
    const m = hh * 60 + mm;
    return m < 360 ? m + 1440 : m;
  };
  return rows.map((r, i) => [r, i]).sort((a, b) => key(a[0]) - key(b[0]) || a[1] - b[1]).map(x => x[0]);
}

export function daysUntil(iso, now = new Date()) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

export function whenLabel(n) {
  if (n == null) return '';
  if (n === 0) return 'היום';
  if (n === 1) return 'מחר';
  if (n === 2) return 'מחרתיים';
  if (n === -1) return 'אתמול';
  return n > 0 ? `בעוד ${n} ימים` : `לפני ${-n} ימים`;
}

const atNoon = iso => new Date(iso + 'T12:00:00');
export function fmtDate(iso, short = false) {
  if (!iso) return '';
  const o = short ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  return new Intl.DateTimeFormat('he-IL', o).format(atNoon(iso));
}
// Hebrew numerals: 5 -> ה׳, 15 -> ט״ו, 787 -> תשפ״ז
export function gematria(n) {
  const L = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'],
    [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
  let out = '';
  n %= 1000;
  while (n >= 400) { out += 'ת'; n -= 400; }
  if (n % 100 === 15 || n % 100 === 16) { const h = n - (n % 100); out += gematriaRaw(h, L) + (n % 100 === 15 ? 'טו' : 'טז'); }
  else out += gematriaRaw(n, L);
  return out.length === 1 ? out + '׳' : out.slice(0, -1) + '״' + out.slice(-1);
}
function gematriaRaw(n, L) {
  let out = '';
  for (const [v, ch] of L) while (n >= v) { out += ch; n -= v; }
  return out;
}

export function hebDate(iso) {
  if (!iso) return '';
  try {
    const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(atNoon(iso));
    return parts.map(p => (p.type === 'day' || p.type === 'year' ? gematria(Number(p.value)) : p.value)).join('');
  } catch {
    return '';
  }
}

export const songText = s => (s ? (s.a ? `${s.t} – ${s.a}` : s.t) : '');

/* ---------- misc ---------- */

// WhatsApp wants the number with country code and digits only. Local Israeli numbers start with 0.
export function waPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '972' + d.slice(1);
  return d.length >= 9 && d.length <= 15 ? d : '';
}

export function okUrl(u) {
  try {
    const x = new URL(String(u || '').trim());
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '';
  } catch {
    return '';
  }
}

export function uid() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return (a[0].toString(36) + a[1].toString(36)).slice(0, 12).padEnd(6, '0');
}
