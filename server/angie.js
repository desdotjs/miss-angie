// =====================================================================
// angie.js: Miss Angie's brain.
// She reads a snapshot of the household, talks with Claude, and uses
// "tools" to actually change things (add an event, set dinner, ...).
// =====================================================================

// ===== IMPORTS =====
import { db, getSetting, addMessage, recentMessages, isoDate, hhmm, addDays, daysBetween, parseEvent } from './db.js';
import { claude, MODEL, textOf, jsonOf } from './claude.js';
import { addHaiku } from './haiku.js';

// ===== CONFIG (what Angie can do) =====
const TOOLS = [
  { name: 'add_family_member', description: 'Add a person to the family.',
    input_schema: { type: 'object', properties: {
      name: { type: 'string' }, role: { type: 'string', description: 'e.g. son, daughter, partner, grandma' },
      age: { type: 'integer' }, notes: { type: 'string', description: 'allergies, activities, bedtimes...' } }, required: ['name'] } },
  { name: 'update_family_member', description: 'Change details about a family member (use their id).',
    input_schema: { type: 'object', properties: {
      id: { type: 'integer' }, name: { type: 'string' }, role: { type: 'string' }, age: { type: 'integer' }, notes: { type: 'string' } }, required: ['id'] } },
  { name: 'add_event', description: 'Put something on the family calendar.',
    input_schema: { type: 'object', properties: {
      title: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: 'HH:MM 24h, optional' },
      member_ids: { type: 'array', items: { type: 'integer' } }, driver: { type: 'string', description: 'who is driving, if anyone' },
      notes: { type: 'string' } }, required: ['title', 'date'] } },
  { name: 'update_event', description: 'Change an event (use its id).',
    input_schema: { type: 'object', properties: {
      id: { type: 'integer' }, title: { type: 'string' }, date: { type: 'string' }, time: { type: 'string' },
      member_ids: { type: 'array', items: { type: 'integer' } }, driver: { type: 'string' }, notes: { type: 'string' } }, required: ['id'] } },
  { name: 'delete_event', description: 'Remove an event.', input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
  { name: 'set_dinner', description: "Set the dinner plan for a day.",
    input_schema: { type: 'object', properties: { date: { type: 'string' }, title: { type: 'string' } }, required: ['date', 'title'] } },
  { name: 'add_groceries', description: 'Add items to the grocery list.',
    input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'string' } } }, required: ['items'] } },
  { name: 'remove_grocery', description: 'Take an item off the grocery list.', input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
  { name: 'add_fridge_items', description: "Record food that's in the fridge, with roughly how many days until it goes bad.",
    input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: {
      name: { type: 'string' }, days_left: { type: 'integer' } }, required: ['name'] } } }, required: ['items'] } },
  { name: 'remove_fridge_item', description: 'Remove something from the fridge (used up or thrown out).', input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
  { name: 'create_decision', description: 'Only when a choice truly needs her: put it on her "Needs you" list with your suggestion. She gets Approve / Other idea buttons.',
    input_schema: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' }, suggestion: { type: 'string' } }, required: ['title', 'suggestion'] } },
  { name: 'add_reminder', description: 'Remind her of something at a time. She gets a notification.',
    input_schema: { type: 'object', properties: { text: { type: 'string' }, due_at: { type: 'string', description: 'YYYY-MM-DDTHH:MM local time' } }, required: ['text', 'due_at'] } },
  { name: 'save_her_haiku', description: "Save a haiku SHE wrote to her haiku notebook. Only call after she's shared it. show_next_morning puts it on tomorrow morning's loading screen.",
    input_schema: { type: 'object', properties: { lines: { type: 'array', items: { type: 'string' } }, show_next_morning: { type: 'boolean' },
      private: { type: 'boolean', description: 'true if she wants to keep it to herself' } }, required: ['lines'] } },
  { name: 'offer_choices', description: 'Attach up to 3 short tappable answers under your reply (e.g. "Yes, tomorrow", "Keep it private").',
    input_schema: { type: 'object', properties: { options: { type: 'array', items: { type: 'string' } } }, required: ['options'] } },
];

// ===== STATE (a snapshot of the household for Angie to read) =====
function snapshot() {
  const today = isoDate();
  const profile = getSetting('profile');
  const angie = getSetting('angie');
  const members = db.prepare('SELECT id, name, role, age, notes FROM members').all();
  const events = db.prepare('SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date, time').all(addDays(today, -1), addDays(today, 21)).map(parseEvent);
  const meals = db.prepare('SELECT * FROM meals WHERE date BETWEEN ? AND ? ORDER BY date').all(today, addDays(today, 7));
  const fridge = db.prepare('SELECT id, name, expires FROM fridge ORDER BY expires').all()
    .map((f) => ({ ...f, days_left: f.expires ? daysBetween(today, f.expires) : null }));
  const groceries = db.prepare('SELECT id, name FROM groceries WHERE checked = 0').all();
  const decisions = db.prepare("SELECT id, title, suggestion FROM decisions WHERE status = 'pending'").all();
  const reminders = db.prepare('SELECT id, text, due_at FROM reminders WHERE done = 0 ORDER BY due_at').all();
  const d = new Date();
  return { now: `${d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${hhmm(d)}`,
    today, profile: { name: profile.name, call_her: profile.nickname || profile.name, pronouns: profile.pronouns },
    angie_settings: angie, members, events, meals, fridge, groceries, pending_decisions: decisions, reminders };
}

function systemPrompt() {
  const s = snapshot();
  return `You are Miss Angie, a warm, slightly fussy mother-hen family secretary in a phone app.
You work for one person: ${s.profile.call_her || 'her'} (${s.profile.pronouns}), a mom. Your whole job is to lift decision fatigue off her.

How you work:
- Make sensible small decisions yourself and just do them with your tools, then say what you did in a sentence. Don't ask permission for little things.
- Only use create_decision when it truly needs her (cost, feelings, conflicts between people). Always include your suggestion.
- Keep replies short: 1 to 3 sentences, plain words, warm. Her preferred tone: ${s.angie_settings.tone}. Call her "${s.profile.call_her || 'love'}" now and then, not every message.
- Dates: today is ${s.today}. Resolve "tomorrow", "Saturday" etc. into YYYY-MM-DD yourself.
- When an event involves kids, set member_ids and say who's driving if you know.
- If she shares a haiku or poem she wrote, be genuinely delighted (briefly), then ask if you can put it on her loading screen tomorrow morning, with offer_choices ["Yes, tomorrow", "Keep it private"]. When she answers, call save_her_haiku.
- If she says "Not this week" to the Sunday haiku check-in, be easygoing about it. Never guilt her.
- Quiet hours are ${s.angie_settings.quietStart}–${s.angie_settings.quietEnd}; during them keep things extra gentle and brief.
- Never invent family members, events or food that aren't in the snapshot or that she didn't tell you.

The household right now (JSON):
${JSON.stringify(s)}`;
}

// ===== OBJECTS (doing what the tools ask) =====
function runTool(name, input, ctx) {
  const today = isoDate();
  switch (name) {
    case 'add_family_member': {
      const colors = ['#7F8F6A', '#B5736A', '#C79A3E', '#8A6FA0', '#6E8FA8', '#B0644A'];
      const n = db.prepare('SELECT COUNT(*) AS n FROM members').get().n;
      const info = db.prepare('INSERT INTO members (name, role, age, notes, color) VALUES (?, ?, ?, ?, ?)')
        .run(input.name, input.role || '', input.age ?? null, input.notes || '', colors[n % colors.length]);
      return { ok: true, id: info.lastInsertRowid };
    }
    case 'update_family_member': {
      const m = db.prepare('SELECT * FROM members WHERE id = ?').get(input.id);
      if (!m) return { error: 'no such member' };
      const x = { ...m, ...input };
      db.prepare('UPDATE members SET name=?, role=?, age=?, notes=? WHERE id=?').run(x.name, x.role, x.age, x.notes, x.id);
      return { ok: true };
    }
    case 'add_event': {
      const info = db.prepare('INSERT INTO events (title, date, time, member_ids, driver, notes) VALUES (?, ?, ?, ?, ?, ?)')
        .run(input.title, input.date, input.time || '', JSON.stringify(input.member_ids || []), input.driver || '', input.notes || '');
      return { ok: true, id: info.lastInsertRowid };
    }
    case 'update_event': {
      const e = db.prepare('SELECT * FROM events WHERE id = ?').get(input.id);
      if (!e) return { error: 'no such event' };
      const x = { ...parseEvent(e), ...input };
      db.prepare('UPDATE events SET title=?, date=?, time=?, member_ids=?, driver=?, notes=? WHERE id=?')
        .run(x.title, x.date, x.time, JSON.stringify(x.member_ids || []), x.driver, x.notes, x.id);
      return { ok: true };
    }
    case 'delete_event': db.prepare('DELETE FROM events WHERE id = ?').run(input.id); return { ok: true };
    case 'set_dinner':
      db.prepare('INSERT INTO meals (date, title) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET title = excluded.title').run(input.date, input.title);
      return { ok: true };
    case 'add_groceries': {
      const ins = db.prepare('INSERT INTO groceries (name, auto) VALUES (?, 1)');
      for (const it of input.items) ins.run(it);
      return { ok: true };
    }
    case 'remove_grocery': db.prepare('DELETE FROM groceries WHERE id = ?').run(input.id); return { ok: true };
    case 'add_fridge_items': {
      const ins = db.prepare('INSERT INTO fridge (name, expires) VALUES (?, ?)');
      for (const it of input.items) ins.run(it.name, it.days_left != null ? addDays(today, it.days_left) : null);
      return { ok: true };
    }
    case 'remove_fridge_item': db.prepare('DELETE FROM fridge WHERE id = ?').run(input.id); return { ok: true };
    case 'create_decision': {
      const info = db.prepare('INSERT INTO decisions (title, detail, suggestion) VALUES (?, ?, ?)').run(input.title, input.detail || '', input.suggestion);
      ctx.decisionId = info.lastInsertRowid;
      return { ok: true, id: info.lastInsertRowid };
    }
    case 'add_reminder':
      db.prepare('INSERT INTO reminders (text, due_at) VALUES (?, ?)').run(input.text, input.due_at);
      return { ok: true };
    case 'save_her_haiku': {
      const h = addHaiku(input.lines, 'mom', { queued: !!input.show_next_morning && !input.private, isPrivate: !!input.private });
      return { ok: true, id: h.id, total_of_hers: db.prepare("SELECT COUNT(*) AS n FROM haiku WHERE author = 'mom'").get().n };
    }
    case 'offer_choices': ctx.actions = (input.options || []).slice(0, 3); return { ok: true };
    default: return { error: `unknown tool ${name}` };
  }
}

// ===== DRAW (one conversation turn) =====
export async function talk(userText, { silentUser = false } = {}) {
  if (!silentUser) addMessage('user', userText);

  if (!claude) {
    const reply = "I'm not fully awake yet: Des still needs to add my Claude API key. I've kept your note right here in the chat.";
    return [addMessage('assistant', reply)];
  }

  // Build the conversation from saved messages (text only; tool details aren't stored).
  const history = recentMessages(24).filter((m) => m.role === 'user' || m.role === 'assistant');
  const msgs = [];
  for (const m of history) {
    const text = m.role === 'user' ? m.text : m.text || '(done)';
    if (msgs.length && msgs[msgs.length - 1].role === m.role) msgs[msgs.length - 1].content += `\n\n${text}`;
    else msgs.push({ role: m.role, content: text });
  }
  if (silentUser) {
    if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs[msgs.length - 1].content += `\n\n${userText}`;
    else msgs.push({ role: 'user', content: userText });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();

  const ctx = { actions: null, decisionId: null };
  const system = systemPrompt();
  let finalText = '';

  for (let i = 0; i < 8; i++) {
    const res = await claude.messages.create({ model: MODEL, max_tokens: 1024, system, tools: TOOLS, messages: msgs });
    finalText = textOf(res) || finalText;
    if (res.stop_reason !== 'tool_use') break;
    msgs.push({ role: 'assistant', content: res.content });
    const results = res.content.filter((b) => b.type === 'tool_use').map((b) => {
      let out;
      try { out = runTool(b.name, b.input, ctx); } catch (err) { out = { error: err.message }; }
      return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) };
    });
    msgs.push({ role: 'user', content: results });
  }

  const meta = {};
  if (ctx.actions?.length) meta.actions = ctx.actions;
  if (ctx.decisionId) meta.decisionId = ctx.decisionId;
  return [addMessage('assistant', finalText || 'Done.', meta)];
}

// ===== UTILITIES (reading a fridge or receipt photo) =====
export async function scanPhoto(dataUrl) {
  if (!claude) throw new Error('Photo reading needs the Claude API key.');
  const [, mediaType, data] = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/) || [];
  if (!data) throw new Error('Not an image');
  const res = await claude.messages.create({
    model: MODEL, max_tokens: 1200,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
      { type: 'text', text: `This is a photo of a fridge, pantry, or grocery receipt. List the food items you can clearly identify.
For each, estimate days until it should be used (fresh herbs/greens 2-4, berries 3, raw meat 2, milk 7, eggs 21, cheese 14, condiments 60).
Reply with JSON only: {"items":[{"name":"spinach","days_left":3}]}. Skip anything you're unsure of.` },
    ] }],
  });
  const { items } = jsonOf(textOf(res));
  const ins = db.prepare('INSERT INTO fridge (name, expires) VALUES (?, ?)');
  for (const it of items || []) ins.run(it.name, addDays(isoDate(), it.days_left ?? 7));
  return items || [];
}
