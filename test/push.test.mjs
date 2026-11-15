import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, vapidHeader, newVapidKeys, b64u, unb64u, concat } from '../worker/push.js';

const enc = new TextEncoder();

// The receiving browser's side of RFC 8291, written separately from the sender (HKDF done by hand with HMAC).
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
async function decrypt(body, uaKeys, authSecret) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ct = body.slice(21 + idlen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey));
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaKeys.privateKey, 256));
  const prkKey = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, ct));
  let end = padded.length - 1;
  while (padded[end] === 0) end--;
  assert.equal(padded[end], 2, 'last-record delimiter');
  return { rs, text: new TextDecoder().decode(padded.slice(0, end)) };
}

async function fakeBrowser() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const p256dh = b64u(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)));
  return { keys, auth, sub: { endpoint: 'https://web.push.apple.com/abc123', keys: { p256dh, auth: b64u(auth) } } };
}

test('a browser can decrypt what we encrypt, Hebrew included', async () => {
  const b = await fakeBrowser();
  const msg = JSON.stringify({ title: 'אירוע חדש 🎉', body: 'יום הולדת · דנה, 40', url: '/?ev=x' });
  const body = await encrypt(b.sub, msg);
  const out = await decrypt(body, b.keys, b.auth);
  assert.equal(out.text, msg);
  assert.equal(out.rs, 4096);
  assert.ok(body.length < 4096, 'push services take up to 4KB');
});

test('every message uses a fresh salt and key', async () => {
  const b = await fakeBrowser();
  const [x, y] = await Promise.all([encrypt(b.sub, 'a'), encrypt(b.sub, 'a')]);
  assert.notDeepEqual(x.slice(0, 86), y.slice(0, 86));
});

test('another browser cannot decrypt it', async () => {
  const a = await fakeBrowser();
  const other = await fakeBrowser();
  const body = await encrypt(a.sub, 'secret');
  await assert.rejects(decrypt(body, other.keys, other.auth));
});

test('VAPID header is a valid ES256 token for the push service', async () => {
  const v = await newVapidKeys();
  assert.equal(unb64u(v.publicKey).length, 65);
  const now = Date.UTC(2026, 10, 15);
  const header = await vapidHeader('https://web.push.apple.com/abc123?x=1', { ...v, subject: 'https://dj-mb.example.workers.dev' }, now);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
  assert.ok(m, header);
  assert.equal(m[4], v.publicKey);
  const claims = JSON.parse(new TextDecoder().decode(unb64u(m[2])));
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.sub, 'https://dj-mb.example.workers.dev');
  assert.equal(claims.exp, now / 1000 + 12 * 3600);
  const pub = await crypto.subtle.importKey('raw', unb64u(v.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64u(m[3]), enc.encode(`${m[1]}.${m[2]}`));
  assert.ok(ok, 'signature verifies');
});
