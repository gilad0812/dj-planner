import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanBrief, buildIcs, eventLine, cleanDj, cleanId, cleanSong, newBrief, defaultsFor, isDefaultList,
  sortTimeline, daysUntil, whenLabel, fmtDate, hebDate, gematria, waPhone, okUrl, uid, TYPE_KEYS, TYPES,
} from '../public/lib.js';

test('cleanBrief fills missing fields and drops wrong types', () => {
  const d = cleanBrief({
    names: 'דנה', type: 'nope', date: '10/6/2027', start: '19:30', end: 'late', guests: 250,
    must: ['שיר חופשי', { t: '  ', a: 'x' }, { t: 'שיר', a: 'אמן' }, 7],
    moments: [null, { label: 'כניסה', song: 'שיר', note: 5 }],
    timeline: [{ time: '9:00', what: 'x' }, 'bad'],
    genres: ['פופ', 3, ''],
    ages: 'kids',
    extra: '<script>',
  });
  assert.equal(d.type, 'other');
  assert.equal(d.date, '');
  assert.equal(d.start, '19:30');
  assert.equal(d.end, '');
  assert.equal(d.guests, '250');
  assert.equal(d.ages, '');
  assert.deepEqual(d.must, [{ t: 'שיר חופשי', a: '' }, { t: 'שיר', a: 'אמן' }]);
  assert.deepEqual(d.moments, [{ label: '', song: null, note: '' }, { label: 'כניסה', song: { t: 'שיר', a: '' }, note: '5' }]);
  assert.deepEqual(d.timeline, [{ time: '', what: 'x' }, { time: '', what: '' }]);
  assert.deepEqual(d.genres, ['פופ', '3']);
  assert.equal('extra' in d, false);
  assert.deepEqual(cleanBrief(null).must, []);
});

test('cleanBrief caps long strings and long lists', () => {
  const d = cleanBrief({ notes: 'א'.repeat(10000), must: Array.from({ length: 500 }, (_, i) => `s${i}`) });
  assert.equal(d.notes.length, 3000);
  assert.equal(d.must.length, 100);
});

test('cleanDj, cleanId and cleanSong', () => {
  assert.deepEqual(cleanDj({ n: ' DJ מיכל ', p: '050-1234567' }), { n: 'DJ מיכל', p: '050-1234567' });
  assert.deepEqual(cleanDj('x'), { n: '', p: '' });
  assert.equal(cleanId('ab12cd34'), 'ab12cd34');
  assert.equal(cleanId('AB12'), '');
  assert.equal(cleanId('../x'), '');
  assert.equal(cleanSong(''), null);
  assert.deepEqual(cleanSong({ t: 'a', a: 'b', x: 1 }), { t: 'a', a: 'b' });
});

test('every event type has defaults, and switching types only replaces untouched lists', () => {
  for (const k of TYPE_KEYS) {
    const def = defaultsFor(k);
    assert.ok(def.moments.length > 0 && def.timeline.length > 0, k);
    assert.ok(isDefaultList(def.moments, k, 'moments'));
    assert.ok(isDefaultList(def.timeline, k, 'timeline'));
  }
  const d = newBrief({ type: 'wedding' });
  assert.ok(isDefaultList(d.moments, 'wedding', 'moments'));
  d.moments[0].song = { t: 'שיר', a: '' };
  assert.equal(isDefaultList(d.moments, 'wedding', 'moments'), false);
  assert.equal(newBrief({}).type, '');
  assert.equal(cleanBrief({ type: '' }).type, '');
  assert.equal(cleanBrief({}).type, 'other');
});

test('every event type has its wording and ends with a closing song', () => {
  assert.ok(TYPE_KEYS.length >= 12);
  for (const k of TYPE_KEYS) {
    const t = TYPES[k];
    assert.ok(t.label && t.to.startsWith('ל'), k);
    assert.equal(t.who.length, 2, k);
    assert.ok(t.who[0] && t.who[1].startsWith('למשל'), k);
    assert.equal(t.moments.at(-1), 'שיר סיום', k);
  }
});

test('every type has valid default moments and timeline', () => {
  for (const k of TYPE_KEYS) {
    const d = newBrief({ type: k });
    assert.equal(d.type, k);
    assert.deepEqual(d.moments.map(m => m.label), TYPES[k].moments, k);
    assert.ok(d.timeline.length > 0 && d.timeline.every(r => /^\d{2}:\d{2}$/.test(r.time)), k);
  }
});

test('timeline sorts past midnight after the evening', () => {
  const rows = [{ time: '00:30', what: 'סיום' }, { time: '', what: 'בלי שעה' }, { time: '19:30', what: 'קבלת פנים' }, { time: '21:00', what: 'ריקודים' }];
  assert.deepEqual(sortTimeline(rows).map(r => r.what), ['קבלת פנים', 'ריקודים', 'סיום', 'בלי שעה']);
});

test('days until an event and its label', () => {
  const now = new Date(2026, 10, 15, 23, 50);
  assert.equal(daysUntil('2026-11-15', now), 0);
  assert.equal(daysUntil('2026-11-16', now), 1);
  assert.equal(daysUntil('2026-11-10', now), -5);
  assert.equal(daysUntil('', now), null);
  assert.equal(whenLabel(0), 'היום');
  assert.equal(whenLabel(12), 'בעוד 12 ימים');
  assert.equal(whenLabel(-3), 'לפני 3 ימים');
});

test('Hebrew dates', () => {
  assert.match(fmtDate('2027-06-10'), /10 ביוני 2027/);
  assert.equal(hebDate('2027-06-10'), 'ה׳ בסיוון תשפ״ז');
  assert.equal(fmtDate(''), '');
});

test('gematria', () => {
  assert.equal(gematria(1), 'א׳');
  assert.equal(gematria(15), 'ט״ו');
  assert.equal(gematria(16), 'ט״ז');
  assert.equal(gematria(30), 'ל׳');
  assert.equal(gematria(5787), 'תשפ״ז');
  assert.equal(gematria(5786), 'תשפ״ו');
  assert.equal(gematria(5715), 'תשט״ו');
});

test('waPhone turns local Israeli numbers into WhatsApp numbers', () => {
  assert.equal(waPhone('050-123-4567'), '972501234567');
  assert.equal(waPhone('+972 50 123 4567'), '972501234567');
  assert.equal(waPhone('00972501234567'), '972501234567');
  assert.equal(waPhone('123'), '');
  assert.equal(waPhone(undefined), '');
});

test('okUrl only allows web links', () => {
  assert.equal(okUrl('https://open.spotify.com/playlist/x'), 'https://open.spotify.com/playlist/x');
  assert.equal(okUrl('javascript:alert(1)'), '');
  assert.equal(okUrl('not a url'), '');
});

test('uid makes ids that pass cleanId', () => {
  for (let i = 0; i < 50; i++) assert.equal(cleanId(uid()) !== '', true);
});

test('uid is long and random enough to act as a key', () => {
  const ids = new Set(Array.from({ length: 200 }, uid));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[a-z0-9]{20}$/);
});

test('eventLine sums up an event', () => {
  assert.match(eventLine(cleanBrief({ type: 'birthday', names: 'דנה, 40', date: '2027-02-20' })), /^יום הולדת · דנה, 40 · .*20/);
  assert.equal(eventLine(cleanBrief({ type: '', names: '' }), 'משפחת לוי'), 'משפחת לוי');
});

test('calendar file: timed event that ends after midnight', () => {
  const d = cleanBrief({ type: 'wedding', names: 'נועה ואיתי', date: '2027-06-10', start: '19:30', end: '01:00', venue: 'גני הדר', city: 'ראשון לציון',
    contactName: 'רונית', contactPhone: '054-1112233', timeline: [{ time: '20:30', what: 'חופה' }, { time: '19:30', what: 'קבלת פנים' }] });
  const ics = buildIcs(d, { uid: 'abc123', url: 'https://x.dev/?ev=abc123', dj: 'DJ MB', stamp: new Date(Date.UTC(2026, 10, 15, 8)) });
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(ics.endsWith('\r\n'));
  assert.match(unfolded, /DTSTART;TZID=Asia\/Jerusalem:20270610T193000\r\n/);
  assert.match(unfolded, /DTEND;TZID=Asia\/Jerusalem:20270611T010000\r\n/);
  assert.match(unfolded, /SUMMARY:DJ MB · חתונה · נועה ואיתי\r\n/);
  assert.ok(unfolded.includes('LOCATION:גני הדר\\, ראשון לציון\r\n'));
  assert.ok(unfolded.includes('19:30 קבלת פנים\\n20:30 חופה'));
  assert.match(unfolded, /UID:abc123@dj-mb/);
  assert.match(unfolded, /TRIGGER:-P1D/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});

test('calendar file: all-day when there is no start time, nothing without a date', () => {
  const ics = buildIcs(cleanBrief({ type: 'brit', date: '2027-12-31' }), { uid: 'x' });
  assert.match(ics, /DTSTART;VALUE=DATE:20271231\r\nDTEND;VALUE=DATE:20280101/);
  assert.equal(buildIcs(cleanBrief({ names: 'x' }), { uid: 'x' }), '');
});
