// =====================================================================
// haiku.js: the daily haiku. Two "slots" a day:
//   slot 1 = before 5pm (morning), slot 2 = 5pm on (evening).
// Each slot gets one haiku, picked once and then remembered.
// =====================================================================

// ===== IMPORTS =====
import { db, getSetting, isoDate } from './db.js';
import { claude, MODEL, textOf, jsonOf } from './claude.js';

// ===== CONFIG =====
const STYLE = `Playful and a little existential. Finding beauty with age, small domestic moments,
weather, light, the body getting older and being fine with it. Warm, wry, never saccharine.
Not always about children. Lowercase, no title, no punctuation at line ends except where natural.`;

// ===== UTILITIES =====
export const slotFor = (d = new Date()) => (d.getHours() < 17 ? 1 : 2);
const row2haiku = (r) => r && { id: r.id, lines: JSON.parse(r.lines), author: r.author, private: !!r.private, queued: !!r.queued, created_at: r.created_at };

export function listHaiku() {
  return db.prepare('SELECT * FROM haiku ORDER BY id DESC').all().map(row2haiku);
}

export function addHaiku(lines, author = 'mom', { queued = false, isPrivate = false } = {}) {
  const info = db.prepare('INSERT INTO haiku (lines, author, queued, private) VALUES (?, ?, ?, ?)')
    .run(JSON.stringify(lines.slice(0, 3)), author, queued ? 1 : 0, isPrivate ? 1 : 0);
  return row2haiku(db.prepare('SELECT * FROM haiku WHERE id = ?').get(info.lastInsertRowid));
}

// ===== OBJECTS (writing a new one in her style) =====
async function writeNewHaiku() {
  const hers = db.prepare("SELECT lines FROM haiku WHERE author = 'mom' AND private = 0 ORDER BY id DESC LIMIT 12").all()
    .map((r) => JSON.parse(r.lines).join(' / '));
  const recent = db.prepare('SELECT lines FROM haiku ORDER BY id DESC LIMIT 20').all()
    .map((r) => JSON.parse(r.lines).join(' / '));
  const name = getSetting('profile').nickname || getSetting('profile').name || 'her';

  const res = await claude.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: `You write one haiku a day for ${name}, a mother and a poet, shown on the loading screen of her family app.
Style: ${STYLE}
${hers.length ? `Her own haiku, to learn her voice from:\n${hers.map((h) => `- ${h}`).join('\n')}` : ''}
Strict 5-7-5 syllables. Reply with JSON only: {"lines": ["line one", "line two", "line three"]}`,
    messages: [{
      role: 'user',
      content: `Today is ${new Date().toDateString()}, ${slotFor() === 1 ? 'morning' : 'evening'}. Write a fresh one. Don't repeat these:\n${recent.join('\n')}`,
    }],
  });
  const { lines } = jsonOf(textOf(res));
  if (!Array.isArray(lines) || lines.length !== 3) throw new Error('Bad haiku');
  return addHaiku(lines, 'angie');
}

// ===== PULSE (pick the haiku for a slot) =====
export async function haikuFor(date = isoDate(), slot = slotFor()) {
  const seen = db.prepare('SELECT haiku_id FROM haiku_views WHERE date = ? AND slot = ?').get(date, slot);
  if (seen) return { ...row2haiku(db.prepare('SELECT * FROM haiku WHERE id = ?').get(seen.haiku_id)), slot };

  let pick = null;

  // 1. One of hers she said "yes, tomorrow" to always goes first.
  const queued = db.prepare("SELECT * FROM haiku WHERE author = 'mom' AND queued = 1 AND private = 0 ORDER BY id LIMIT 1").get();
  if (queued) {
    db.prepare('UPDATE haiku SET queued = 0 WHERE id = ?').run(queued.id);
    pick = row2haiku(queued);
  }

  // 2. Sometimes bring back one of her old ones (if she likes that).
  if (!pick && getSetting('angie').resurface && Math.random() < 0.25) {
    const old = db.prepare("SELECT * FROM haiku WHERE author = 'mom' AND private = 0 ORDER BY RANDOM() LIMIT 1").get();
    if (old) pick = row2haiku(old);
  }

  // 3. Otherwise Angie writes a new one.
  if (!pick && claude) {
    try { pick = await writeNewHaiku(); } catch (err) { console.error('haiku:', err.message); }
  }

  // 4. No API key (or it failed): reuse the least recently shown of Angie's.
  if (!pick) {
    pick = row2haiku(db.prepare(`
      SELECT h.* FROM haiku h LEFT JOIN haiku_views v ON v.haiku_id = h.id
      WHERE h.private = 0 GROUP BY h.id ORDER BY MAX(COALESCE(v.date, '')) ASC, RANDOM() LIMIT 1`).get());
  }

  db.prepare('INSERT OR IGNORE INTO haiku_views (date, slot, haiku_id) VALUES (?, ?, ?)').run(date, slot, pick.id);
  return { ...pick, slot };
}
