// =====================================================================
// scheduler.js: things Angie does on her own, on a clock.
//   - Sunday evening: asks if she's written any haiku this week
//   - Reminders: sends them when they're due
//   - 4:30am and 4:30pm: prepares the next haiku so the loading screen is instant
// =====================================================================

import cron from 'node-cron';
import { db, getSetting, setSetting, addMessage, isoDate, hhmm } from './db.js';
import { haikuFor } from './haiku.js';
import { notify } from './push.js';

// A key for "this week", so the Sunday check-in only happens once.
function weekKey(d = new Date()) {
  const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  return isoDate(sunday);
}

export function sundayCheckin(now = new Date()) {
  const { checkinDay, checkinTime } = getSetting('angie');
  const sys = getSetting('system');
  if (now.getDay() !== Number(checkinDay) || hhmm(now) < checkinTime || sys.lastCheckinWeek === weekKey(now)) return false;

  const name = getSetting('profile').nickname || getSetting('profile').name;
  const day = now.toLocaleDateString('en-US', { weekday: 'long' });
  const part = now.getHours() >= 17 ? ' evening' : now.getHours() < 12 ? ' morning' : '';
  const text = `Happy ${day}${part}${name ? `, ${name}` : ''}. Did you write anything this week? Even one line counts.`;
  addMessage('assistant', text, { actions: ['Share a haiku', 'Not this week'], checkin: true });
  setSetting('system', { lastCheckinWeek: weekKey(now) });
  notify('Miss Angie', 'Did you write anything this week? Even one line counts.');
  return true;
}

export function dueReminders(now = new Date()) {
  const stamp = `${isoDate(now)}T${hhmm(now)}`;
  const due = db.prepare('SELECT * FROM reminders WHERE done = 0 AND notified = 0 AND due_at <= ?').all(stamp);
  for (const r of due) {
    addMessage('assistant', `Reminder: ${r.text}`, { reminderId: r.id });
    db.prepare('UPDATE reminders SET notified = 1 WHERE id = ?').run(r.id);
    notify('Reminder', r.text, { force: true });
  }
}

export function startScheduler() {
  cron.schedule('* * * * *', () => {
    try { sundayCheckin(); dueReminders(); } catch (err) { console.error('scheduler:', err.message); }
  });
  cron.schedule('30 4 * * *', () => haikuFor(isoDate(), 1).catch(() => {}));
  cron.schedule('30 16 * * *', () => {
    // Evening slot starts at 5pm; prepare it a little early.
    const d = new Date(); d.setHours(17, 0, 0, 0);
    haikuFor(isoDate(d), 2).catch(() => {});
  });
}
