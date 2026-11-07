// =====================================================================
// views.js: the screens (Home, Family, Fridge, Me, Notebook, Profile)
// and their slide-up sheets. Each screen is a function that returns HTML.
// =====================================================================

// ===== IMPORTS =====
import { S, register, refresh, rerender } from './store.js';
import { post, patch, put, del, get } from './api.js';
import { GREETING, moonSVG } from './theme.js';
import { AVATARS } from './art.js';
import { esc, row, toggle, iso, addDays, fromIso, niceTime, ampm, niceDate, openSheet, closeSheet, toast, formData,
         henAv, youAv, bigAvatar, avatarFor, PEN, CHECK, pickFile, shrinkImage } from './ui.js';

// ===== UTILITIES =====
const D = () => S.data;
const localDay = (ts) => iso(new Date(ts.includes('T') ? ts : `${ts.replace(' ', 'T')}Z`)); // SQLite times are UTC
const today = () => D().today;
const member = (id) => D().members.find((m) => m.id === id);
const whoLine = (e) => {
  const names = e.member_ids.map(member).filter(Boolean).map((m) => m.name);
  const who = names.length === 0 ? '' : names.length === D().members.length && names.length > 1 ? 'Everyone' : names.join(' & ');
  return [who, e.driver ? `${e.driver} driving` : ''].filter(Boolean).join(' · ');
};
const evColor = (e) => member(e.member_ids[0])?.color || 'var(--acc)';
const eventsOn = (date, who = 'all') => D().events.filter((e) => e.date === date && (who === 'all' || e.member_ids.includes(Number(who))))
  .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
const meal = (date) => D().meals.find((m) => m.date === date)?.title;
const callHer = () => D().profile.nickname || D().profile.name;
const time = () => document.documentElement.dataset.time;
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

const evRows = (list) => list.length
  ? list.map((e) => `<div class="ev"><span class="dot" style="background:${evColor(e)}"></span><b>${niceTime(e.time) || '·'}</b><span>${esc(e.title)}${whoLine(e) ? ` <span class="mute" style="color:var(--card-mute)">· ${esc(whoLine(e))}</span>` : ''}</span></div>`).join('')
  : '<div class="empty">Nothing on the calendar.</div>';

function weatherCorner() {
  let inner;
  if (S.showTemp && S.wx) inner = `<span class="temp">${S.wx.temp}°</span>`;
  else if (time() === 'night') inner = moonSVG();
  else inner = S.wx?.svg || '';
  return `<button class="wx" data-action="wx-toggle" aria-label="Weather">${inner}</button>`;
}

// ===== HOME =====
function needsCard() {
  const ds = D().decisions;
  if (!ds.length) return '';
  const d = ds[0];
  return `<button class="card edge" style="width:100%;text-align:left" data-action="decision" data-id="${d.id}">
    <div class="card-head"><span><b>Needs you</b> · ${esc(d.title)}</span><span class="chev">›</span></div>
    ${ds.length > 1 ? `<div class="hint">and ${ds.length - 1} more</div>` : ''}</button>`;
}

function remindersCard() {
  const due = D().reminders.filter((r) => r.due_at.slice(0, 10) <= today());
  if (!due.length) return '';
  return `<div class="card"><div class="cap">Reminders</div>${due.map((r) => `
    <div class="ev"><span class="grow" style="flex:1">${esc(r.text)} <span style="color:var(--card-mute)">· ${ampm(r.due_at.slice(11))}</span></span>
    <button class="btn small" data-action="reminder-done" data-id="${r.id}">Done</button></div>`).join('')}</div>`;
}

function familyCard(title, date, after = '') {
  const list = eventsOn(date).filter((e) => !after || (e.time && e.time > after));
  return `<button class="card" style="width:100%;text-align:left;display:block" data-action="go" data-to="family" data-day="${date}">
    <div class="card-head"><span class="cap">${title}</span><span class="chev">›</span></div>${evRows(list)}</button>`;
}

function fridgeCard(bigFirst) {
  const d = meal(today());
  const soon = D().fridge.filter((f) => f.days_left != null && f.days_left <= 2);
  const left = D().groceries.filter((g) => !g.checked).length;
  return `<button class="card" style="width:100%;text-align:left;display:block" data-action="go" data-to="fridge">
    <div class="card-head"><span class="cap">${bigFirst ? 'Dinner' : 'Fridge'}</span><span class="chev">›</span></div>
    <div class="big">${d ? (bigFirst ? esc(d) : `Tonight: ${esc(d)}`) : 'No dinner plan yet'}</div>
    <div class="chips">${soon[0] ? `<span class="chip accent">Use soon: ${esc(soon[0].name)}</span>` : ''}<span class="chip">List · ${left}</span></div></button>`;
}

function welcomeCard() {
  if (D().members.length || D().events.length) return '';
  return `<div class="card"><div class="big" style="font-size:22px">Let's get to know your family</div>
    <p style="margin-top:6px;line-height:1.5">Tell Miss Angie about everyone below, in your own words. Or add people yourself in the Family tab.</p></div>`;
}

export function home() {
  const t = time();
  const todays = eventsOn(today());
  let sub, cards;
  if (t === 'morning') {
    sub = `${niceDate(today(), { weekday: 'long', month: 'long', day: 'numeric' })} · ${todays.length || 'nothing'} on today`;
    cards = needsCard() + remindersCard() + familyCard('Family today', today()) + fridgeCard(false);
  } else if (t === 'afternoon') {
    const next = todays.find((e) => e.time && e.time >= nowHHMM());
    sub = next ? `Next: ${esc(next.title)} at ${ampm(next.time)}` : 'The rest of today is clear';
    cards = (next ? `<div class="card dark"><div class="cap">Next up · ${niceTime(next.time)}</div><div class="big">${esc(next.title)}</div>
      ${whoLine(next) ? `<div style="font-size:13px;opacity:.75;margin-top:4px">${esc(whoLine(next))}</div>` : ''}</div>` : '')
      + needsCard() + remindersCard() + familyCard('Rest of today', today(), next?.time || nowHHMM()) + fridgeCard(false);
  } else if (t === 'evening') {
    sub = meal(today()) ? "Dinner's planned." : 'Nothing planned for dinner yet.';
    if (!D().decisions.length) sub += ' Nothing needs you.';
    cards = fridgeCard(true) + needsCard() + remindersCard() + familyCard('Tomorrow', addDays(today(), 1));
  } else {
    sub = D().decisions.length ? 'One thing can wait until morning.' : "Tomorrow's handled. Rest.";
    cards = familyCard('Tomorrow', addDays(today(), 1)) +
      `<div class="card"><div class="big" style="font-size:21px">Angie's on quiet mode</div>
      <div class="hint">No notifications until ${ampm(D().angie.quietEnd)}. She'll still listen if you ask.</div></div>`;
  }
  return `<div class="head"><h1>${GREETING[t]}</h1>${weatherCorner()}</div>
    <div class="sub">${sub}</div>${welcomeCard()}${cards}`;
}

// ===== FAMILY =====
export function family() {
  const day = S.famDay || today();
  const start = (() => { const d = fromIso(day); const k = (d.getDay() + 6) % 7; return addDays(day, -k); })(); // Monday
  const days = [...Array(7)].map((_, i) => addDays(start, i));
  const label = day === today() ? 'Today' : niceDate(day, { weekday: 'long', month: 'short', day: 'numeric' });
  const list = eventsOn(day, S.famWho);
  const chips = [`<button class="chip ${S.famWho === 'all' ? 'on' : ''}" data-action="fam-who" data-who="all">All</button>`]
    .concat(D().members.map((m) => `<button class="chip ${String(S.famWho) === String(m.id) ? 'on' : ''}" data-action="fam-who" data-who="${m.id}"><span class="dot" style="background:${m.color}"></span>${esc(m.name)}</button>`)).join('');
  return `<div class="head"><h1>Family</h1><button class="icon-btn" style="color:var(--ink);border-color:var(--line);font-size:20px" data-action="member-sheet" aria-label="Add a person">+</button></div>
    <div class="chips">${chips}</div>
    <div class="head" style="margin-top:16px"><button class="back" data-action="fam-week" data-n="-7">‹</button>
      <span class="mute" style="font-size:13px">${niceDate(start, { month: 'long', day: 'numeric' })} – ${niceDate(addDays(start, 6), { month: 'short', day: 'numeric' })}</span>
      <button class="back" data-action="fam-week" data-n="7">›</button></div>
    <div class="week">${days.map((d) => `<span class="dname">${'MTWTFSS'[(fromIso(d).getDay() + 6) % 7]}</span>`).join('')}
      ${days.map((d) => `<button class="${d === day ? 'on' : ''} ${d === today() ? 'today' : ''}" data-action="fam-day" data-day="${d}"><span class="num">${fromIso(d).getDate()}</span>
        <span class="dots">${eventsOn(d, S.famWho).slice(0, 3).map((e) => `<i style="background:${evColor(e)}"></i>`).join('')}</span></button>`).join('')}</div>
    <div class="head" style="margin-top:18px"><span class="cap">${label}</span><button class="link" data-action="event-sheet" data-day="${day}">+ Add</button></div>
    ${list.length ? list.map((e) => `<button class="event" data-action="event-sheet" data-id="${e.id}"><span class="t">${niceTime(e.time)}</span>
      <span class="box" style="border-left-color:${evColor(e)}"><b>${esc(e.title)}</b>${whoLine(e) || e.notes ? `<div>${esc([whoLine(e), e.notes].filter(Boolean).join(' · '))}</div>` : ''}</span></button>`).join('')
      : '<div class="mute" style="padding:10px 0;font-size:14px">Nothing planned. Lovely.</div>'}
    <div class="cap" style="margin-top:22px">People</div>
    <div class="card" style="padding-top:4px;padding-bottom:4px">${D().members.length ? D().members.map((m) => `
      <button class="row" data-action="member-sheet" data-id="${m.id}"><span class="person" style="border-color:${m.color};background:color-mix(in srgb, ${m.color} 18%, transparent)"></span>
      <span class="grow"><b style="font-weight:600">${esc(m.name)}${m.age ? `, ${m.age}` : ''}</b><div class="hint" style="margin-top:1px">${esc([m.role, m.notes].filter(Boolean).join(' · ')) || 'Tap to add details'}</div></span><span class="chev">›</span></button>`).join('')
      : '<div class="empty" style="padding:12px 0">No one yet. Tap + to add someone, or just tell Miss Angie.</div>'}</div>`;
}

// ===== FRIDGE =====
export function fridge() {
  const items = D().fridge;
  const groceries = D().groceries;
  const bar = (f) => {
    if (f.days_left == null) return '';
    const pct = Math.max(6, Math.min(100, (f.days_left / 10) * 100));
    const c = f.days_left <= 1 ? '#C79A3E' : f.days_left <= 3 ? '#D4B26A' : 'var(--kid1)';
    return `<div class="bar-line"><i style="width:${pct}%;background:${c}"></i></div>`;
  };
  const left = (f) => (f.days_left == null ? '' : f.days_left < 0 ? 'past its best' : f.days_left === 0 ? 'today' : `${f.days_left} day${f.days_left === 1 ? '' : 's'}`);
  return `<div class="head"><h1>The fridge</h1><button class="chip" data-action="fridge-scan">Snap a photo</button></div>
    <div class="sub">${items.length} thing${items.length === 1 ? '' : 's'} inside</div>
    <button class="card dark" style="width:100%;text-align:left;display:block" data-action="meal-sheet" data-day="${today()}">
      <div class="cap">Tonight's dinner</div><div class="big">${esc(meal(today()) || 'Tap to plan dinner')}</div>
      ${meal(today()) ? '' : '<div style="font-size:13px;opacity:.75;margin-top:4px">Or ask Miss Angie to pick something from what\'s here.</div>'}</button>
    <div class="card"><div class="card-head"><span class="cap">Use soon</span><button class="link" data-action="fridge-add">+ Add</button></div>
      ${items.length ? items.map((f) => `<button class="row" style="display:block" data-action="fridge-item" data-id="${f.id}">
        <div style="display:flex;justify-content:space-between;font-size:14.5px"><span>${esc(f.name)}</span><span class="val" style="font-size:13px">${left(f)}</span></div>${bar(f)}</button>`).join('')
        : '<div class="empty">Empty for now. Snap a photo of the fridge or a receipt and Miss Angie will fill it in.</div>'}</div>
    <div class="card"><div class="card-head"><span class="cap">Grocery list</span>${groceries.some((g) => g.checked) ? '<button class="link" data-action="groceries-clear">Clear checked</button>' : ''}</div>
      ${groceries.map((g) => `<button class="grocery ${g.checked ? 'done' : ''}" data-action="grocery-toggle" data-id="${g.id}" data-checked="${g.checked}"><span class="box">${g.checked ? CHECK : ''}</span>${esc(g.name)}${g.auto && !g.checked ? '<span class="val" style="margin-left:auto;font-size:11.5px">added by Angie</span>' : ''}</button>`).join('')}
      <form class="addline" data-form="grocery-add"><input class="input" name="name" placeholder="Add something…" autocomplete="off"><button class="btn small solid">Add</button></form></div>
    <div class="card" style="padding-top:2px;padding-bottom:2px">${row("This week's meals", `${D().meals.filter((m) => m.date >= today() && m.date <= addDays(today(), 6)).length} of 7 planned`, 'meals-week')}</div>`;
}

// ===== ME =====
export function me() {
  const p = D().profile, a = D().angie;
  const notifOn = 'Notification' in window && Notification.permission === 'granted';
  return `<div class="profile-top"><button class="big-av" data-action="avatar-sheet">${bigAvatar(p)}<span class="pen">${PEN}</span></button>
    <div class="serif" style="font-size:30px;margin-top:10px">${esc(p.name || 'You')}</div>
    <div class="sub">Miss Angie calls you “${esc(callHer() || 'love')}”</div></div>
    <div class="card"><div class="cap">About you</div>
      ${row('Name', esc(p.name), 'go', 'data-to="profile"')}${row('Angie calls you', esc(callHer()), 'go', 'data-to="profile"')}
      ${row('Pronouns', esc(p.pronouns), 'go', 'data-to="profile"')}${row('Your color', `<span class="dot" style="width:14px;height:14px;background:${p.color}"></span>`, 'go', 'data-to="profile"')}
      ${row('Birthday', p.birthday ? niceDate(p.birthday, { month: 'long', day: 'numeric' }) : 'Add', 'go', 'data-to="profile"')}</div>
    <div class="card"><div class="cap">Miss Angie</div>
      ${row('How she talks', esc(a.tone), 'tone-sheet')}
      ${row('Quiet hours', `${ampm(a.quietStart)} – ${ampm(a.quietEnd)}`, 'quiet-sheet')}
      ${row('Haiku notebook', `${D().haikuCount.hers} of yours`, 'go', 'data-to="notebook"')}
      <div class="row"><span class="grow">Temperature in °${a.tempUnit}</span>${toggle(a.tempUnit === 'C', 'temp-unit')}</div>
      <div class="row"><span class="grow">Notifications<div class="hint" style="margin-top:1px">${D().push.enabled ? (notifOn ? 'On' : 'Reminders and the Sunday check-in') : 'Not set up yet (needs VAPID keys)'}</div></span>
        ${D().push.enabled ? `<button class="btn small ${notifOn ? '' : 'solid'}" data-action="push-on">${notifOn ? 'Test' : 'Turn on'}</button>` : ''}</div></div>
    <div style="text-align:center;margin-top:22px"><button class="mute" style="font-size:13px" data-action="logout">Log out</button></div>`;
}

// ===== PROFILE (edit) =====
export function profile() {
  const p = S.draft || (S.draft = { ...D().profile });
  const nickPicks = [p.name, 'Mom', 'Mama'].filter(Boolean);
  const colors = ['#5B6B8C', '#BD8A78', '#6E7A4E', '#B0644A', '#8A6FA0', '#C79A3E'];
  return `<div class="head"><button class="back" data-action="go" data-to="me">‹ Back</button><b>Edit profile</b><button class="link" data-action="profile-save">Save</button></div>
    <div class="profile-top" style="margin-top:18px"><button class="big-av" style="width:76px;height:76px" data-action="avatar-sheet">${avatarFor(p)}</button>
      <button class="link" style="margin-top:10px;color:var(--ink)" data-action="avatar-sheet">Change picture</button></div>
    <div class="card" style="margin-top:16px">
      <div class="field" style="margin-top:0"><label class="cap">Your name</label><input class="input" data-bind="name" value="${esc(p.name)}" autocomplete="given-name"></div>
      <div class="field"><label class="cap">What should Miss Angie call you?</label><input class="input" data-bind="nickname" value="${esc(p.nickname)}">
        <div class="hint">She'll use this when she talks to you.</div>
        <div class="chips">${nickPicks.map((n) => `<button class="chip ${p.nickname === n ? 'on' : ''}" data-action="draft" data-key="nickname" data-val="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>
      <div class="field"><label class="cap">Pronouns</label><div class="chips">${['she/her', 'he/him', 'they/them'].map((x) => `<button class="chip ${p.pronouns === x ? 'on' : ''}" data-action="draft" data-key="pronouns" data-val="${x}">${x}</button>`).join('')}</div></div>
      <div class="field"><label class="cap">Your color</label><div class="swatches">${colors.map((c) => `<button class="swatch ${p.color === c ? 'on' : ''}" style="background:${c}" data-action="draft" data-key="color" data-val="${c}" aria-label="${c}"></button>`).join('')}</div>
        <div class="hint">Your events show up in this color on the Family calendar.</div></div>
      <div class="field"><label class="cap">Birthday</label><input class="input" type="date" data-bind="birthday" value="${esc(p.birthday)}"></div>
    </div>
    <button class="btn solid wide" style="margin-top:18px" data-action="profile-save">Save</button>`;
}

// ===== NOTEBOOK =====
export function notebook() {
  const list = S.haiku.filter((h) => S.noteFilter === 'all' || (S.noteFilter === 'mine' ? h.author === 'mom' : h.author === 'angie'));
  const a = D().angie;
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][a.checkinDay];
  return `<div class="head"><button class="back" data-action="go" data-to="me">‹ Me</button><button class="link" data-action="haiku-compose">+ Add one of mine</button></div>
    <h1 class="serif" style="font-size:34px;font-weight:400;margin-top:10px">Haiku notebook</h1>
    <div class="sub">${D().haikuCount.hers} of yours · Miss Angie writes the rest in your style</div>
    <div class="chips">${[['all', 'All'], ['mine', 'Yours'], ['angie', "Miss Angie's"]].map(([k, l]) => `<button class="chip ${S.noteFilter === k ? 'on' : ''}" data-action="note-filter" data-f="${k}">${l}</button>`).join('')}</div>
    ${list.map((h) => `<button class="card ${h.author === 'mom' ? 'edge' : ''}" style="width:100%;text-align:left;display:block" data-action="haiku-item" data-id="${h.id}">
      <div class="poem-card">${h.lines.map(esc).join('<br>')}</div>
      <div class="poem-meta"><span class="by">${h.author === 'mom' ? `${youAv(D().profile, 18)} You` : `${henAv(18)} Miss Angie`}${h.private ? ' · private' : ''}${h.queued ? ' · showing next' : ''}</span>
      <span>${niceDate(localDay(h.created_at))}</span></div></button>`).join('') || '<div class="mute" style="margin-top:16px">Nothing here yet.</div>'}
    <div class="card" style="padding-top:2px;padding-bottom:2px">
      ${row('Haiku check-in', `${dayName}s, ${ampm(a.checkinTime)}`, 'checkin-sheet')}
      <div class="row"><span class="grow">Bring back my old ones sometimes</span>${toggle(a.resurface, 'resurface')}</div></div>`;
}

export const VIEWS = { home, family, fridge, me, profile, notebook };

// ===== SHEETS (slide-up panels) =====
function eventSheet(id, day) {
  const e = id ? D().events.find((x) => x.id === Number(id)) : { title: '', date: day || today(), time: '', member_ids: [], driver: '', notes: '' };
  const sheet = openSheet(`<h2>${id ? 'Edit event' : 'New event'}</h2>
    <div class="field"><label class="cap">What</label><input class="input" name="title" value="${esc(e.title)}" placeholder="Soccer practice"></div>
    <div style="display:flex;gap:10px"><div class="field" style="flex:1.3"><label class="cap">Day</label><input class="input" type="date" name="date" value="${e.date}"></div>
      <div class="field" style="flex:1"><label class="cap">Time</label><input class="input" type="time" name="time" value="${e.time}"></div></div>
    ${D().members.length ? `<div class="field"><label class="cap">Who</label><div class="chips" data-multi="member_ids">${D().members.map((m) => `<button class="chip ${e.member_ids.includes(m.id) ? 'on' : ''}" data-action="chip-multi" data-val="${m.id}"><span class="dot" style="background:${m.color}"></span>${esc(m.name)}</button>`).join('')}</div></div>` : ''}
    <div class="field"><label class="cap">Who's driving</label><input class="input" name="driver" value="${esc(e.driver)}" placeholder="optional"></div>
    <div class="field"><label class="cap">Notes</label><input class="input" name="notes" value="${esc(e.notes)}" placeholder="optional"></div>
    <div class="btns" style="margin-top:18px">${id ? `<button class="btn" data-action="event-delete" data-id="${id}">Delete</button>` : ''}<button class="btn solid" data-action="event-save" data-id="${id || ''}">Save</button></div>`);
  sheet.dataset.kind = 'event';
}

function memberSheet(id) {
  const m = id ? member(Number(id)) : { name: '', role: '', age: '', color: ['#7F8F6A', '#B5736A', '#C79A3E', '#8A6FA0', '#6E8FA8'][D().members.length % 5], notes: '' };
  const colors = ['#7F8F6A', '#B5736A', '#C79A3E', '#8A6FA0', '#6E8FA8', '#B0644A'];
  openSheet(`<h2>${id ? esc(m.name) : 'Add a person'}</h2>
    <div class="field"><label class="cap">Name</label><input class="input" name="name" value="${esc(m.name)}"></div>
    <div style="display:flex;gap:10px"><div class="field" style="flex:2"><label class="cap">Who they are</label><input class="input" name="role" value="${esc(m.role)}" placeholder="son, partner, grandma…"></div>
      <div class="field" style="flex:1"><label class="cap">Age</label><input class="input" type="number" inputmode="numeric" name="age" value="${m.age ?? ''}"></div></div>
    <div class="field"><label class="cap">Notes for Angie</label><textarea class="input" rows="2" name="notes" placeholder="no peanuts, soccer Tue/Thu, bed at 8…">${esc(m.notes)}</textarea></div>
    <div class="field"><label class="cap">Their color</label><div class="swatches" data-single="color">${colors.map((c) => `<button class="swatch ${m.color === c ? 'on' : ''}" style="background:${c}" data-action="chip-single" data-val="${c}"></button>`).join('')}</div></div>
    <div class="btns" style="margin-top:18px">${id ? `<button class="btn" data-action="member-delete" data-id="${id}">Remove</button>` : ''}<button class="btn solid" data-action="member-save" data-id="${id || ''}">Save</button></div>`);
}

function avatarSheet() {
  const p = S.route === 'profile' ? S.draft : D().profile;
  const names = { blossom: 'Blossom', maple: 'Maple', bamboo: 'Bamboo', pine: 'Pine', moon: 'Moon', sun: 'Sun', wave: 'Waves', initial: 'Initial' };
  openSheet(`<h2>Choose a picture</h2>
    <div class="btns"><button class="btn" data-action="avatar-photo" data-cap="user">Take a photo</button><button class="btn" data-action="avatar-photo">From your photos</button></div>
    <div class="cap" style="margin-top:18px">Or pick an ink drawing</div>
    <div class="avatar-grid">${Object.entries(names).map(([k, n]) => `<button class="${!p.photo && p.avatar === k ? 'on' : ''}" data-action="avatar-pick" data-k="${k}">${avatarFor({ ...p, photo: '' }, k)}${n}</button>`).join('')}</div>`);
}

export function decisionSheet(id) {
  const d = D().decisions.find((x) => x.id === Number(id));
  if (!d) return;
  openSheet(`<div class="cap">Needs your OK</div><h2 style="margin-top:6px">${esc(d.title)}</h2>
    ${d.detail ? `<p style="margin-top:8px;line-height:1.5">${esc(d.detail)}</p>` : ''}
    <div class="cap" style="margin-top:16px">Angie suggests</div><div class="card" style="margin-top:6px;line-height:1.5">${esc(d.suggestion)}</div>
    <div class="btns" style="margin-top:16px"><button class="btn solid" data-action="decide" data-id="${d.id}" data-s="approved">Approve</button><button class="btn" data-action="decide-other" data-id="${d.id}">Other idea</button></div>`, {});
}

export function haikuComposer({ fromMessage } = {}) {
  openSheet(`<h2>Share a haiku</h2><p class="hint" style="font-size:14px">Three lines. It doesn't have to be perfect.</p>
    ${[1, 2, 3].map((i) => `<input class="input serif" style="font-size:19px" name="l${i}" placeholder="${['first line', 'second line', 'third line'][i - 1]}" autocomplete="off">`).join('')}
    <div class="row" style="margin-top:12px;border:0"><span class="grow">Show it on tomorrow morning's loading screen</span><input type="checkbox" name="queued" checked style="width:22px;height:22px;accent-color:var(--acc)"></div>
    <div class="btns"><button class="btn" data-action="close-sheet">Not now</button><button class="btn solid" data-action="haiku-save" data-from="${fromMessage || ''}">Save it</button></div>`);
}

function haikuItemSheet(id) {
  const h = S.haiku.find((x) => x.id === Number(id));
  if (!h) return;
  const mine = h.author === 'mom';
  openSheet(`<div class="poem-card" style="font-size:21px;margin-top:6px">${h.lines.map(esc).join('<br>')}</div>
    <div class="hint">${mine ? 'Written by you' : 'Written by Miss Angie, in your style'} · ${niceDate(localDay(h.created_at), { month: 'long', day: 'numeric', year: 'numeric' })}</div>
    <div style="margin-top:14px">
      ${mine ? `<button class="row" data-action="haiku-flag" data-id="${h.id}" data-k="queued" data-v="${h.queued ? 0 : 1}"><span class="grow">${h.queued ? "Don't show it next" : 'Show it on the next loading screen'}</span></button>
      <button class="row" data-action="haiku-flag" data-id="${h.id}" data-k="private" data-v="${h.private ? 0 : 1}"><span class="grow">${h.private ? 'Let it show on the loading screen' : 'Keep it private'}</span></button>` : ''}
      <button class="row" data-action="haiku-delete" data-id="${h.id}"><span class="grow" style="color:#B0644A">Delete</span></button></div>`);
}

// ===== ACTIONS (what the buttons do) =====
const keepScroll = async (fn) => { const y = scrollY; await fn(); scrollTo(0, y); };

register({
  'go': (el) => {
    if (el.dataset.day) S.famDay = el.dataset.day;
    if (el.dataset.to === 'notebook') loadHaiku();
    if (el.dataset.to !== 'profile') S.draft = null;
    location.hash = `#/${el.dataset.to}`;
  },
  'wx-toggle': () => { S.showTemp = !S.showTemp; rerender(); },
  'decision': (el) => decisionSheet(el.dataset.id),
  'reminder-done': async (el) => { await patch(`/reminders/${el.dataset.id}`); refresh(); },

  // Family
  'fam-who': (el) => { S.famWho = el.dataset.who; rerender(); },
  'fam-day': (el) => { S.famDay = el.dataset.day; rerender(); },
  'fam-week': (el) => { S.famDay = addDays(S.famDay || today(), Number(el.dataset.n)); rerender(); },
  'event-sheet': (el) => eventSheet(el.dataset.id, el.dataset.day),
  'member-sheet': (el) => memberSheet(el.dataset.id),
  'chip-multi': (el) => el.classList.toggle('on'),
  'chip-single': (el) => { el.parentElement.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); el.classList.add('on'); },
  'event-save': async (el) => {
    const sheet = el.closest('.sheet'); const f = formData(sheet);
    if (!f.title) return toast('Give it a name first.');
    f.member_ids = [...sheet.querySelectorAll('[data-multi] .on')].map((b) => Number(b.dataset.val));
    if (el.dataset.id) await patch(`/events/${el.dataset.id}`, f); else await post('/events', f);
    S.famDay = f.date; closeSheet(); refresh();
  },
  'event-delete': async (el) => { await del(`/events/${el.dataset.id}`); closeSheet(); refresh(); },
  'member-save': async (el) => {
    const sheet = el.closest('.sheet'); const f = formData(sheet);
    if (!f.name) return toast('What\'s their name?');
    f.age = f.age ? Number(f.age) : null;
    f.color = sheet.querySelector('[data-single] .on')?.dataset.val || '#7F8F6A';
    if (el.dataset.id) await patch(`/members/${el.dataset.id}`, f); else await post('/members', f);
    closeSheet(); refresh();
  },
  'member-delete': async (el) => { if (confirm('Remove this person?')) { await del(`/members/${el.dataset.id}`); closeSheet(); refresh(); } },

  // Fridge
  'fridge-scan': async () => {
    const file = await pickFile('image/*', 'environment');
    if (!file) return;
    toast('Miss Angie is having a look…', 6000);
    try {
      const { items } = await post('/fridge/scan', { image: await shrinkImage(file) });
      toast(items.length ? `Added ${items.length} thing${items.length === 1 ? '' : 's'} to the fridge.` : "I couldn't make anything out. Try a closer photo?");
      refresh();
    } catch (err) { toast(err.message); }
  },
  'fridge-add': () => openSheet(`<h2>Add to the fridge</h2>
    <div class="field"><label class="cap">What</label><input class="input" name="name" placeholder="spinach"></div>
    <div class="field"><label class="cap">Good for about</label><div class="chips" data-single="days">${[[1, '1 day'], [3, '3 days'], [7, 'a week'], [14, '2 weeks'], ['', "doesn't spoil"]].map(([v, l], i) => `<button class="chip ${i === 1 ? 'on' : ''}" data-action="chip-single" data-val="${v}">${l}</button>`).join('')}</div></div>
    <button class="btn solid wide" style="margin-top:18px" data-action="fridge-save">Add</button>`),
  'fridge-save': async (el) => {
    const sheet = el.closest('.sheet'); const name = formData(sheet).name;
    if (!name) return;
    await post('/fridge', { name, days_left: sheet.querySelector('[data-single] .on')?.dataset.val });
    closeSheet(); refresh();
  },
  'fridge-item': (el) => {
    const f = D().fridge.find((x) => x.id === Number(el.dataset.id));
    openSheet(`<h2>${esc(f.name)}</h2><div class="btns" style="margin-top:16px"><button class="btn" data-action="fridge-remove" data-id="${f.id}" data-list="1">Used up · add to list</button><button class="btn solid" data-action="fridge-remove" data-id="${f.id}">Remove</button></div>`);
  },
  'fridge-remove': async (el) => {
    const f = D().fridge.find((x) => x.id === Number(el.dataset.id));
    await del(`/fridge/${el.dataset.id}`);
    if (el.dataset.list) await post('/groceries', { name: f.name });
    closeSheet(); refresh();
  },
  'grocery-toggle': (el) => keepScroll(async () => { await patch(`/groceries/${el.dataset.id}`, { checked: el.dataset.checked !== '1' }); await refresh(); }),
  'groceries-clear': async () => { await post('/groceries/clear'); refresh(); },
  'meal-sheet': (el) => {
    const day = el.dataset.day;
    openSheet(`<h2>Dinner, ${day === today() ? 'tonight' : niceDate(day)}</h2>
      <div class="field"><input class="input" name="title" value="${esc(meal(day) || '')}" placeholder="chicken tacos"></div>
      <div class="hint">Or leave it blank and ask Miss Angie to decide from what's in the fridge.</div>
      <button class="btn solid wide" style="margin-top:16px" data-action="meal-save" data-day="${day}">Save</button>`);
  },
  'meal-save': async (el) => { await put(`/meals/${el.dataset.day}`, formData(el.closest('.sheet'))); closeSheet(); refresh(); },
  'meals-week': () => {
    const days = [...Array(7)].map((_, i) => addDays(today(), i));
    openSheet(`<h2>This week's meals</h2>${days.map((d) => `<div class="field"><label class="cap">${i18nDay(d)}</label><input class="input" name="${d}" value="${esc(meal(d) || '')}" placeholder="—"></div>`).join('')}
      <button class="btn solid wide" style="margin-top:16px" data-action="meals-save">Save</button>`);
  },
  'meals-save': async (el) => {
    const f = formData(el.closest('.sheet'));
    await Promise.all(Object.entries(f).map(([d, title]) => put(`/meals/${d}`, { title })));
    closeSheet(); refresh();
  },

  // Me & profile
  'draft': (el) => { S.draft[el.dataset.key] = el.dataset.val; if (el.dataset.key === 'nickname') { const i = document.querySelector('[data-bind="nickname"]'); if (i) i.value = el.dataset.val; } rerender(); },
  'profile-save': async () => {
    document.querySelectorAll('[data-bind]').forEach((i) => { S.draft[i.dataset.bind] = i.value.trim(); });
    await put('/settings', { profile: S.draft });
    S.draft = null; toast('Saved.'); location.hash = '#/me'; refresh();
  },
  'avatar-sheet': () => avatarSheet(),
  'avatar-pick': async (el) => {
    if (S.route === 'profile') { Object.assign(S.draft, { avatar: el.dataset.k, photo: '' }); closeSheet(); rerender(); return; }
    await put('/settings', { profile: { avatar: el.dataset.k, photo: '' } }); closeSheet(); refresh();
  },
  'avatar-photo': async (el) => {
    const file = await pickFile('image/*', el.dataset.cap);
    if (!file) return;
    const photo = await shrinkImage(file, 320, 0.85);
    if (S.route === 'profile') { Object.assign(S.draft, { photo }); closeSheet(); rerender(); return; }
    await put('/settings', { profile: { photo } }); closeSheet(); refresh();
  },
  'tone-sheet': () => openSheet(`<h2>How Miss Angie talks</h2><div style="margin-top:8px">${[['Warm', 'Kind and cozy, a little fussy'], ['Brief', 'Just the facts, short and sweet'], ['Playful', 'Teases you a little, in a nice way'], ['Gentle', 'Extra soft and calm']].map(([t, d]) => `
    <button class="row" data-action="tone-pick" data-t="${t}"><span class="grow"><b style="font-weight:600">${t}</b><div class="hint" style="margin-top:1px">${d}</div></span>${D().angie.tone === t ? '✓' : ''}</button>`).join('')}</div>`),
  'tone-pick': async (el) => { await put('/settings', { angie: { tone: el.dataset.t } }); closeSheet(); refresh(); },
  'quiet-sheet': () => openSheet(`<h2>Quiet hours</h2><p class="hint" style="font-size:14px">No notifications in this window (reminders still come through).</p>
    <div style="display:flex;gap:10px"><div class="field" style="flex:1"><label class="cap">From</label><input class="input" type="time" name="quietStart" value="${D().angie.quietStart}"></div>
    <div class="field" style="flex:1"><label class="cap">Until</label><input class="input" type="time" name="quietEnd" value="${D().angie.quietEnd}"></div></div>
    <button class="btn solid wide" style="margin-top:16px" data-action="angie-save">Save</button>`),
  'checkin-sheet': () => openSheet(`<h2>Haiku check-in</h2><p class="hint" style="font-size:14px">When Miss Angie asks if you've written anything this week.</p>
    <div class="field"><label class="cap">Day</label><select class="input" name="checkinDay">${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => `<option value="${i}" ${Number(D().angie.checkinDay) === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
    <div class="field"><label class="cap">Time</label><input class="input" type="time" name="checkinTime" value="${D().angie.checkinTime}"></div>
    <button class="btn solid wide" style="margin-top:16px" data-action="angie-save">Save</button>`),
  'angie-save': async (el) => {
    const f = formData(el.closest('.sheet'));
    if (f.checkinDay !== undefined) f.checkinDay = Number(f.checkinDay);
    await put('/settings', { angie: f }); closeSheet(); refresh();
  },
  'temp-unit': async () => { await put('/settings', { angie: { tempUnit: D().angie.tempUnit === 'F' ? 'C' : 'F' } }); S.wxUnit = null; await refresh(); window.dispatchEvent(new Event('weather')); },
  'resurface': async () => { await put('/settings', { angie: { resurface: !D().angie.resurface } }); refresh(); },
  'logout': async () => { await post('/logout'); location.reload(); },

  // Notebook
  'note-filter': (el) => { S.noteFilter = el.dataset.f; rerender(); },
  'haiku-compose': () => haikuComposer(),
  'haiku-item': (el) => haikuItemSheet(el.dataset.id),
  'haiku-flag': async (el) => { await patch(`/haiku/${el.dataset.id}`, { [el.dataset.k]: el.dataset.v === '1' }); closeSheet(); await loadHaiku(); },
  'haiku-delete': async (el) => { if (confirm('Delete this haiku?')) { await del(`/haiku/${el.dataset.id}`); closeSheet(); await loadHaiku(); refresh(); } },
});

function i18nDay(d) { return d === today() ? 'Tonight' : niceDate(d, { weekday: 'long', month: 'short', day: 'numeric' }); }

export async function loadHaiku() {
  S.haiku = await get('/haiku');
  rerender();
}
