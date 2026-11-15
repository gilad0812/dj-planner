-- Each event starts as a link the DJ sends; the client's answers fill in `data`.
CREATE TABLE events (
  id TEXT PRIMARY KEY,               -- random; also the client's access to the form
  label TEXT NOT NULL DEFAULT '',    -- optional name the DJ typed when making the link
  created INTEGER NOT NULL,          -- ms since 1970
  updated INTEGER NOT NULL,
  submitted INTEGER,                 -- last time the client confirmed; NULL until the first time
  data TEXT,                         -- the client's answers, JSON
  deleted INTEGER                    -- set when the DJ deletes the event
);

-- Phones that get notifications (normally just the DJ's).
CREATE TABLE subs (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created INTEGER NOT NULL
);
