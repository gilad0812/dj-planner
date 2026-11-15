# DJ MB event planner

A small Hebrew web app for DJ MB. She sends each client a link, the client fills in the event details on their phone, and the filled-in details come back to her on WhatsApp as a run sheet for the event.

It covers any kind of event: wedding, henna, engagement, bar and bat mitzvah, brit, birthday, bachelor/bachelorette party, school party, company event, private party, or anything else. Each type comes with its own key moments (for example candle lighting for a bar mitzvah, cake for a birthday, speeches for a company event) and a typical timeline, which the client can change.

There is no server and no database. Every event's details travel inside the link (compressed after the `#`, so even the web host never sees them), and the DJ's events are saved in the browser on her phone.

## How it works

1. **First time**: the DJ opens the site, checks her stage name (filled in as DJ MB) and enters her WhatsApp number.
2. **New event**: she picks the type of event, enters whose event it is, the date and venue, then taps "שליחה בוואטסאפ" to send the client a link.
3. **The client** fills in a 6-step form: details, music style, key moments (with song search), must-play / maybe / do-not-play songs, timeline and notes. Their progress is saved on their phone as they go.
4. **The client taps send**: WhatsApp opens to the DJ's chat with a message holding a link to the filled-in details.
5. **The DJ opens that link** on her phone: the event is saved in her list, with a run sheet she can print, Waze navigation, a call button for the contact person on the day, and YouTube search links for every song.

If the client changes something later, they send again and the newer version replaces the old one. The DJ can also send an "update link" that opens the form already filled in.

## Files

- `index.html`, `style.css`, `app.js`: the app (no build step)
- `lib.js`: pure logic: packing data into links, cleaning data from links, defaults per event type, Hebrew dates
- `test/lib.test.mjs`: tests for `lib.js`, run with `npm test` (Node 18+)

## Run it locally

```bash
python -m http.server 8765
```

Then open http://localhost:8765. It must be served over http, not opened as a file.

## Put it online (free)

Any static host works. With GitHub Pages: push these files to a GitHub repo, then in the repo's Settings → Pages, choose "Deploy from a branch", `main`, `/ (root)`. The site will be at `https://<username>.github.io/<repo>/`.

## Good to know

- **Add it to the home screen** on the DJ's phone (Safari: Share → Add to Home Screen). Safari can clear website data for sites that aren't used for a while, and home-screen apps are protected from that.
- **Backups**: Settings → "הורדת גיבוי" saves a file with all events. Even without a backup, every event can be recovered by opening the link the client sent on WhatsApp again.
- Song search uses Apple's free iTunes search, so it needs an internet connection. Clients can always type a song name instead.
- Links are long (around 1,000 characters for a filled-in event). That's fine for WhatsApp. If a link gets cut off when copied somewhere else, the app says so instead of showing broken data.
