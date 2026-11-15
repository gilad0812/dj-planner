# DJ MB

A small Hebrew app for DJ MB, an event DJ. She sends a client a link; the client fills in the event details, songs and timeline on their phone and confirms; she gets a phone notification, sees the event in her app, and can add it to her iPhone calendar with one tap.

It covers any kind of event: wedding, henna, engagement, bar and bat mitzvah, brit, birthday, bachelor/bachelorette party, school party, company event, private party, or other. Each type has its own key moments and typical timeline, which the client can change.

Setting it up (accounts, deploy, installing on her phone): see [SETUP.md](SETUP.md).

## How it works

- **Her app** (`/`): installed on her iPhone home screen. "קישור חדש ללקוח" creates an event and opens WhatsApp or the share sheet with the link. The list shows upcoming events, links still waiting to be filled in, and past events. Each event has the full run sheet, print, Waze, a call button for the contact on the day, and "הוספה ליומן".
- **The client's form** (`/?e=<id>`): 6 steps (details, music style, key moments with song search, songs, timeline, confirm). Progress is saved on the client's phone; confirming sends it to the server. They can reopen the same link later, change things and confirm again.
- **Notifications**: when a client confirms, the server sends a Web Push notification ("אירוע חדש" or "עדכון באירוע") to her phone. Tapping it opens that event.
- **Calendar**: "הוספה ליומן" downloads an `.ics` file that iPhone offers to add to the calendar, with a reminder a day before.

## Pieces

- `public/`: the app (no build step). `lib.js` holds the pure logic (event types, data cleaning, Hebrew dates, calendar files); `app.js` the screens; `sw.js` shows notifications.
- `worker/`: a Cloudflare Worker. `index.js` is the API and serves `public/`; `push.js` is Web Push (RFC 8291 encryption and VAPID) using only Web Crypto.
- `migrations/`: the D1 (SQLite) tables: `events` and `subs` (phones that get notifications).
- Access: the event id in the client's link (20 random characters) is the client's only key, and only lets them read and update that one event. Her app uses a secret connection code (`ADMIN_KEY`).
- Song search uses Apple's free iTunes search API.

## Develop

```bash
npm install
node scripts/make-keys.mjs
npx wrangler d1 migrations apply dj-mb --local
npm run dev
```

Then open http://localhost:8787 and paste `ADMIN_KEY` from `.dev.vars` as the connection code. Client links are `http://localhost:8787/?e=<id>`.

```bash
npm test
```

Tests cover the logic, the calendar file, and push encryption (checked against a separately written decryption) and VAPID signatures.
