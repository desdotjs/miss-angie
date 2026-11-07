// =====================================================================
// index.js: the web server. Serves the app and its small API.
// Everything behind /api (except login) needs the passcode cookie.
// =====================================================================

// ===== IMPORTS =====
import 'dotenv/config';
process.env.TZ ||= 'America/Chicago';

import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import path from 'node:path';
import { db, getSetting, setSetting, recentMessages, isoDate, addDays, daysBetween, parseEvent, addMessage } from './db.js';
import { talk, scanPhoto } from './angie.js';
import { haikuFor, listHaiku, addHaiku, slotFor } from './haiku.js';
import { saveSubscription, publicKey, pushEnabled, notify } from './push.js';
import { startScheduler, sundayCheckin } from './scheduler.js';
import { claude } from './claude.js';

// ===== CONFIG =====
const PORT = process.env.PORT || 3000;
const PASSCODE = process.env.APP_PASSCODE || 'angie';
// The cookie-signing secret: from the environment, or made once and kept in the database.
const SECRET = process.env.SESSION_SECRET || getSetting('secrets').session || setSetting('secrets', { session: crypto.randomBytes(32).toString('hex') }).session;
if (!process.env.APP_PASSCODE) console.warn('APP_PASSCODE not set: using "angie". Set one before sharing the link!');

const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser(SECRET));
app.use(express.static(path.resolve('public'), { extensions: ['html'] }));

// ===== UTILITIES =====
const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
};
const same = (a, b) => {
  const [x, y] = [Buffer.from(String(a)), Buffer.from(String(b))];
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// ===== LOGIN (one passcode, one mom) =====
app.post('/api/login', (req, res) => {
  if (!same(req.body?.passcode || '', PASSCODE)) return res.status(401).json({ error: 'That passcode isn\'t right.' });
  res.cookie('ma', 'ok', { signed: true, httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 365 * 864e5 });
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { res.clearCookie('ma'); res.json({ ok: true }); });
app.use('/api', (req, res, next) => (req.signedCookies.ma === 'ok' ? next() : res.status(401).json({ error: 'login' })));

// ===== STATE (everything the screens need, in one call) =====
app.get('/api/state', wrap(() => {
  sundayCheckin(); // in case the server was asleep at 7:30
  const today = isoDate();
  return {
    today, now: new Date().toISOString(), aiAwake: !!claude, push: { enabled: pushEnabled, key: publicKey() },
    profile: getSetting('profile'), angie: getSetting('angie'), location: getSetting('location'), system: getSetting('system'),
    members: db.prepare('SELECT * FROM members ORDER BY id').all(),
    events: db.prepare('SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date, time').all(addDays(today, -7), addDays(today, 60)).map(parseEvent),
    meals: db.prepare('SELECT * FROM meals WHERE date BETWEEN ? AND ?').all(addDays(today, -1), addDays(today, 14)),
    fridge: db.prepare('SELECT * FROM fridge ORDER BY expires IS NULL, expires').all()
      .map((f) => ({ ...f, days_left: f.expires ? daysBetween(today, f.expires) : null })),
    groceries: db.prepare('SELECT * FROM groceries ORDER BY checked, id DESC').all(),
    decisions: db.prepare("SELECT * FROM decisions WHERE status = 'pending' ORDER BY id DESC").all(),
    reminders: db.prepare('SELECT * FROM reminders WHERE done = 0 ORDER BY due_at').all(),
    messages: recentMessages(60),
    haikuCount: { hers: db.prepare("SELECT COUNT(*) AS n FROM haiku WHERE author = 'mom'").get().n,
                  all: db.prepare('SELECT COUNT(*) AS n FROM haiku').get().n },
  };
}));

// ===== SETTINGS =====
app.put('/api/settings', wrap((req) => {
  for (const key of ['profile', 'angie', 'location', 'system']) if (req.body[key]) setSetting(key, req.body[key]);
  // First hello, right after she tells Angie her name.
  if (req.body.system?.onboarded && db.prepare('SELECT COUNT(*) AS n FROM messages').get().n === 0) {
    const p = getSetting('profile');
    addMessage('assistant', `Hello, ${p.nickname || p.name}! I'm so glad you're here. Tell me about your family and your week in your own words, and I'll keep track of all of it. You can type, or tap the mic and just talk.`);
  }
  return { ok: true };
}));

// ===== FAMILY =====
app.post('/api/members', wrap((req) => {
  const { name, role = '', age = null, color = '#7F8F6A', notes = '' } = req.body;
  return { id: db.prepare('INSERT INTO members (name, role, age, color, notes) VALUES (?, ?, ?, ?, ?)').run(name, role, age, color, notes).lastInsertRowid };
}));
app.patch('/api/members/:id', wrap((req) => {
  const m = { ...db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id), ...req.body };
  db.prepare('UPDATE members SET name=?, role=?, age=?, color=?, notes=? WHERE id=?').run(m.name, m.role, m.age, m.color, m.notes, req.params.id);
  return { ok: true };
}));
app.delete('/api/members/:id', wrap((req) => { db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id); return { ok: true }; }));

app.post('/api/events', wrap((req) => {
  const { title, date, time = '', member_ids = [], driver = '', notes = '' } = req.body;
  return { id: db.prepare('INSERT INTO events (title, date, time, member_ids, driver, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(title, date, time, JSON.stringify(member_ids), driver, notes).lastInsertRowid };
}));
app.patch('/api/events/:id', wrap((req) => {
  const e = { ...parseEvent(db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id)), ...req.body };
  db.prepare('UPDATE events SET title=?, date=?, time=?, member_ids=?, driver=?, notes=? WHERE id=?')
    .run(e.title, e.date, e.time, JSON.stringify(e.member_ids), e.driver, e.notes, req.params.id);
  return { ok: true };
}));
app.delete('/api/events/:id', wrap((req) => { db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id); return { ok: true }; }));

// ===== FRIDGE =====
app.post('/api/fridge', wrap((req) => {
  const { name, days_left } = req.body;
  return { id: db.prepare('INSERT INTO fridge (name, expires) VALUES (?, ?)').run(name, days_left != null && days_left !== '' ? addDays(isoDate(), Number(days_left)) : null).lastInsertRowid };
}));
app.delete('/api/fridge/:id', wrap((req) => { db.prepare('DELETE FROM fridge WHERE id = ?').run(req.params.id); return { ok: true }; }));
app.post('/api/fridge/scan', wrap(async (req) => ({ items: await scanPhoto(req.body.image) })));

app.post('/api/groceries', wrap((req) => ({ id: db.prepare('INSERT INTO groceries (name) VALUES (?)').run(req.body.name).lastInsertRowid })));
app.patch('/api/groceries/:id', wrap((req) => { db.prepare('UPDATE groceries SET checked = ? WHERE id = ?').run(req.body.checked ? 1 : 0, req.params.id); return { ok: true }; }));
app.delete('/api/groceries/:id', wrap((req) => { db.prepare('DELETE FROM groceries WHERE id = ?').run(req.params.id); return { ok: true }; }));
app.post('/api/groceries/clear', wrap(() => { db.prepare('DELETE FROM groceries WHERE checked = 1').run(); return { ok: true }; }));

app.put('/api/meals/:date', wrap((req) => {
  if (!req.body.title) db.prepare('DELETE FROM meals WHERE date = ?').run(req.params.date);
  else db.prepare('INSERT INTO meals (date, title) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET title = excluded.title').run(req.params.date, req.body.title);
  return { ok: true };
}));

// ===== DECISIONS & REMINDERS =====
app.patch('/api/decisions/:id', wrap(async (req) => {
  const d = db.prepare('SELECT * FROM decisions WHERE id = ?').get(req.params.id);
  if (!d) return { error: 'gone' };
  const { status, idea = '' } = req.body; // 'approved' | 'declined'
  db.prepare('UPDATE decisions SET status = ? WHERE id = ?').run(status, d.id);
  const said = status === 'approved' ? `Approve: ${d.suggestion}` : `Other idea for "${d.title}": ${idea}`;
  addMessage('user', said);
  const replies = await talk(status === 'approved'
    ? `I approved your suggestion for "${d.title}": ${d.suggestion}. Please go ahead and do it with your tools.`
    : `For "${d.title}", I'd rather: ${idea}. Please sort it out that way.`, { silentUser: true });
  return { messages: replies };
}));
app.patch('/api/reminders/:id', wrap((req) => { db.prepare('UPDATE reminders SET done = 1 WHERE id = ?').run(req.params.id); return { ok: true }; }));

// ===== CHAT =====
app.post('/api/chat', wrap(async (req) => {
  const { text, fromMessage, choice } = req.body;
  if (fromMessage) { // she tapped one of Angie's buttons: remember which, so it greys out
    const m = db.prepare('SELECT meta FROM messages WHERE id = ?').get(fromMessage);
    if (m) db.prepare('UPDATE messages SET meta = ? WHERE id = ?').run(JSON.stringify({ ...JSON.parse(m.meta), chosen: choice || text }), fromMessage);
  }
  return { messages: await talk(text) };
}));

// ===== HAIKU =====
app.get('/api/haiku/today', wrap(async () => haikuFor(isoDate(), slotFor())));
app.get('/api/haiku', wrap(() => listHaiku()));
app.post('/api/haiku', wrap((req) => addHaiku(req.body.lines, 'mom', { queued: !!req.body.queued, isPrivate: !!req.body.private })));
app.patch('/api/haiku/:id', wrap((req) => {
  const { private: isPrivate, queued } = req.body;
  if (isPrivate !== undefined) db.prepare('UPDATE haiku SET private = ? WHERE id = ?').run(isPrivate ? 1 : 0, req.params.id);
  if (queued !== undefined) db.prepare('UPDATE haiku SET queued = ? WHERE id = ?').run(queued ? 1 : 0, req.params.id);
  return { ok: true };
}));
app.delete('/api/haiku/:id', wrap((req) => { db.prepare('DELETE FROM haiku WHERE id = ?').run(req.params.id); return { ok: true }; }));

// ===== PUSH =====
app.post('/api/push/subscribe', wrap((req) => { saveSubscription(req.body); return { ok: true }; }));
app.post('/api/push/test', wrap(async () => { await notify('Miss Angie', "Notifications are on. I'll only nudge you when it matters.", { force: true }); return { ok: true }; }));

// ===== INIT =====
app.get('/{*splat}', (req, res) => res.sendFile(path.resolve('public/index.html')));
app.listen(PORT, () => console.log(`Miss Angie is listening on http://localhost:${PORT}  (AI ${claude ? 'awake' : 'asleep: no API key'}, push ${pushEnabled ? 'on' : 'off'})`));
startScheduler();
