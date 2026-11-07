// =====================================================================
// push.js: phone notifications (Web Push).
// Works once the app is added to her home screen and she taps
// "Turn on notifications" in the Me tab. Needs VAPID keys in .env.
// =====================================================================

import * as webpush from 'web-push';
import { db, getSetting, hhmm } from './db.js';

import { setSetting } from './db.js';

// Use keys from the environment if given; otherwise make a pair once and keep it in the database.
let { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
const { VAPID_CONTACT = 'mailto:hello@example.com' } = process.env;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  let saved = getSetting('secrets');
  if (!saved.vapidPublic) {
    const k = webpush.generateVAPIDKeys();
    saved = setSetting('secrets', { vapidPublic: k.publicKey, vapidPrivate: k.privateKey });
  }
  VAPID_PUBLIC_KEY = saved.vapidPublic; VAPID_PRIVATE_KEY = saved.vapidPrivate;
}
export const pushEnabled = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (pushEnabled) webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export const publicKey = () => VAPID_PUBLIC_KEY || '';

export function saveSubscription(sub) {
  db.prepare('INSERT INTO push_subs (endpoint, sub) VALUES (?, ?) ON CONFLICT(endpoint) DO UPDATE SET sub = excluded.sub')
    .run(sub.endpoint, JSON.stringify(sub));
}

// Is it currently inside her quiet hours?
export function inQuietHours(d = new Date()) {
  const { quietStart, quietEnd } = getSetting('angie');
  const t = hhmm(d);
  return quietStart > quietEnd ? (t >= quietStart || t < quietEnd) : (t >= quietStart && t < quietEnd);
}

export async function notify(title, body, { url = '/', force = false } = {}) {
  if (!pushEnabled || (!force && inQuietHours())) return;
  const subs = db.prepare('SELECT * FROM push_subs').all();
  for (const s of subs) {
    try {
      await webpush.sendNotification(JSON.parse(s.sub), JSON.stringify({ title, body, url }));
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(s.endpoint);
      else console.error('push:', err.message);
    }
  }
}
