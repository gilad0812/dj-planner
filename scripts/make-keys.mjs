// Makes the secrets the server needs: the DJ's private access key and the notification (VAPID) keys.
//   node scripts/make-keys.mjs           writes .dev.vars for local testing
//   node scripts/make-keys.mjs --print   prints them, to store in Cloudflare with `wrangler secret put`
import { writeFileSync, existsSync } from 'node:fs';
import { newVapidKeys } from '../worker/push.js';

const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const bytes = crypto.getRandomValues(new Uint8Array(24));
const ADMIN_KEY = Array.from(bytes, b => abc[b % abc.length]).join('');
const { publicKey, privateKey } = await newVapidKeys();
const vars = { ADMIN_KEY, VAPID_PUBLIC: publicKey, VAPID_PRIVATE: privateKey };

if (process.argv.includes('--print')) {
  for (const [k, v] of Object.entries(vars)) console.log(`${k}=${v}`);
} else {
  if (existsSync('.dev.vars')) {
    console.error('.dev.vars already exists; delete it first to make new keys.');
    process.exit(1);
  }
  writeFileSync('.dev.vars', Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  console.log('Wrote .dev.vars');
}
