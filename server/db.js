// =====================================================================
// db.js: Miss Angie's memory. One SQLite file holds everything.
// =====================================================================

// ===== IMPORTS =====
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// ===== CONFIG =====
const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true });
export const db = new Database(path.join(DATA_DIR, 'miss-angie.db'));
db.pragma('journal_mode = WAL');

// ===== WORLD (the tables) =====
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT DEFAULT '', age INTEGER,
    color TEXT DEFAULT '#7F8F6A', notes TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL, time TEXT DEFAULT '',
    member_ids TEXT DEFAULT '[]', driver TEXT DEFAULT '', notes TEXT DEFAULT '');

  CREATE TABLE IF NOT EXISTS fridge (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, expires TEXT, added TEXT DEFAULT CURRENT_TIMESTAMP);

  CREATE TABLE IF NOT EXISTS groceries (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, checked INTEGER DEFAULT 0, auto INTEGER DEFAULT 0);

  CREATE TABLE IF NOT EXISTS meals (date TEXT PRIMARY KEY, title TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, detail TEXT DEFAULT '', suggestion TEXT DEFAULT '',
    status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP);

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY, text TEXT NOT NULL, due_at TEXT NOT NULL, done INTEGER DEFAULT 0, notified INTEGER DEFAULT 0);

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL, meta TEXT DEFAULT '{}',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP);

  CREATE TABLE IF NOT EXISTS haiku (
    id INTEGER PRIMARY KEY, lines TEXT NOT NULL, author TEXT NOT NULL, private INTEGER DEFAULT 0,
    queued INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

  CREATE TABLE IF NOT EXISTS haiku_views (date TEXT, slot INTEGER, haiku_id INTEGER, PRIMARY KEY (date, slot));

  CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, sub TEXT NOT NULL);
`);

// ===== STATE (settings with defaults) =====
const DEFAULTS = {
  profile: { name: '', nickname: '', pronouns: 'she/her', color: '#5B6B8C', birthday: '', avatar: 'blossom', photo: '' },
  angie: { tone: 'Warm', quietStart: '21:00', quietEnd: '07:00', tempUnit: 'F', resurface: true,
           checkinDay: 0, checkinTime: '19:30' },
  location: { lat: 41.8781, lon: -87.6298, label: 'Chicago' },
  system: { lastCheckinWeek: '', onboarded: false },
  secrets: {},
};

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  const saved = row ? JSON.parse(row.value) : {};
  return { ...DEFAULTS[key], ...saved };
}

export function setSetting(key, patch) {
  const next = { ...getSetting(key), ...patch };
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(next));
  return next;
}

// ===== UTILITIES (local dates) =====
const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hhmm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + n));
}
export function daysBetween(fromIso, toIso) {
  const [a, b] = [fromIso, toIso].map((s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); });
  return Math.round((b - a) / 86400000);
}

// ===== OBJECTS (small helpers used everywhere) =====
export function addMessage(role, text, meta = {}) {
  const info = db.prepare('INSERT INTO messages (role, text, meta) VALUES (?, ?, ?)').run(role, text, JSON.stringify(meta));
  return { id: info.lastInsertRowid, role, text, meta, created_at: new Date().toISOString() };
}

export function recentMessages(limit = 60) {
  return db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT ?').all(limit).reverse()
    .map((m) => ({ ...m, meta: JSON.parse(m.meta || '{}') }));
}

export function parseEvent(e) {
  return { ...e, member_ids: JSON.parse(e.member_ids || '[]') };
}

// ===== INIT (starter haiku so the very first morning has one) =====
const STARTERS = [
  ['silver at the roots', 'the mirror and I agree', 'we have both been loved'],
  ['the moon has wrinkles', 'no one asks it to hide them', 'look how it still glows'],
  ['my knees forecast rain', 'the weather app is jealous', 'the sun shows up too'],
];
if (db.prepare('SELECT COUNT(*) AS n FROM haiku').get().n === 0) {
  const ins = db.prepare("INSERT INTO haiku (lines, author) VALUES (?, 'angie')");
  for (const h of STARTERS) ins.run(JSON.stringify(h));
}
