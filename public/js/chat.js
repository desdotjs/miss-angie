// =====================================================================
// chat.js: Miss Angie herself. Her card in the dock, the opened-up
// conversation, voice mode, and her tappable answer buttons.
// =====================================================================

// ===== IMPORTS =====
import { S, register, refresh, rerender } from './store.js';
import { post, patch } from './api.js';
import { esc, henAv, youAv, MIC, UP, DOWN, openSheet, closeSheet, toast, formData, niceDate, iso, pickFile, shrinkImage } from './ui.js';
import { HEN } from './art.js';
import { decisionSheet, haikuComposer } from './views.js';

// ===== UTILITIES =====
const D = () => S.data;
const isNight = () => document.documentElement.dataset.time === 'night';
const status = () => (S.thinking ? 'thinking…' : !D().aiAwake ? 'resting (no API key yet)' : isNight() ? 'quiet mode' : 'here with you');
const placeholder = () => (isNight() ? 'Whisper to Miss Angie…' : 'Message Miss Angie…');
const timeOf = (m) => new Date(m.created_at.includes('T') ? m.created_at : `${m.created_at.replace(' ', 'T')}Z`);

// Buttons Angie attached to a message (or a decision she made).
function actionsFor(m, small = false) {
  const meta = m.meta || {};
  let html = '';
  if (meta.decisionId) {
    const pending = D().decisions.find((d) => d.id === meta.decisionId);
    html += pending
      ? `<div class="btns"><button class="btn ${small ? 'small' : ''} solid" data-action="decide" data-id="${pending.id}" data-s="approved">Approve</button><button class="btn ${small ? 'small' : ''}" data-action="decide-other" data-id="${pending.id}">Other idea</button></div>`
      : '<div class="hint">Decided ✓</div>';
  }
  if (meta.actions?.length) {
    const done = !!meta.chosen;
    html += `<div class="btns">${meta.actions.map((a, i) => `<button class="btn ${small ? 'small' : ''} ${i === 0 ? 'solid' : ''}" data-action="choose" data-mid="${m.id}" data-choice="${esc(a)}" ${done ? 'disabled' : ''}>${esc(a)}${meta.chosen === a ? ' ✓' : ''}</button>`).join('')}</div>`;
  }
  return html;
}

// Show a shared haiku (three short lines) as a pretty quote.
function formatText(t) {
  const m = t.match(/^(.*?)\n((?:[^\n]{1,48}\n){2}[^\n]{1,48})$/s);
  if (m) return `${esc(m[1])}<div class="quote">${esc(m[2]).replace(/\n/g, '<br>')}</div>`;
  return esc(t);
}

// ===== OBJECTS: the card in the dock =====
export function angieCard(compact = false) {
  const msgs = D().messages;
  const last = msgs.slice(-1);
  const lastAngie = [...msgs].reverse().find((m) => m.role === 'assistant');
  let show = S.thinking ? last : last.length && last[0].role === 'user' && lastAngie ? [lastAngie, last[0]] : last;
  if (compact) show = show.slice(-1);
  return `<div class="angie ${compact ? 'compact' : ''}">
    <div class="angie-head"><button class="av" style="width:36px;height:36px" data-action="chat-open" aria-label="Open Miss Angie">${HEN}<span class="here"></span></button>
      <button style="flex:1;text-align:left" data-action="chat-open"><div class="name">Miss Angie</div><div class="status">${status()}</div></button>
      <button class="icon-btn" data-action="chat-open" aria-label="Open the conversation">${UP}</button></div>
    ${show.length ? `<div class="angie-last">${show.map((m) => `<div class="say">${m.role === 'assistant' ? henAv(20) : youAv(D().profile, 20)}
      <div style="flex:1;min-width:0"><b class="${m.role === 'user' ? 'who-you' : ''}">${m.role === 'assistant' ? 'Miss Angie' : 'You'}</b> ${esc(m.text.length > 140 ? `${m.text.slice(0, 140)}…` : m.text)}
      ${!compact && m === show[show.length - 1] && m.role === 'assistant' ? actionsFor(m, true) : ''}</div></div>`).join('')}
      ${S.thinking ? '<div class="say"><span class="typing"><i></i><i></i><i></i></span></div>' : ''}</div>` : ''}
    <form class="ask" data-form="ask"><input name="text" id="ask-input" data-keep placeholder="${placeholder()}" autocomplete="off" enterkeyhint="send">
      <button type="button" class="mic" data-action="voice" aria-label="Talk to Miss Angie">${MIC}</button></form></div>`;
}

// ===== DRAW: the opened-up conversation =====
let chatEl = null;
function chatBody() {
  let lastDay = '';
  return D().messages.map((m) => {
    const t = timeOf(m);
    const day = iso(t);
    const rule = day !== lastDay ? `<div class="day-rule"><span class="cap">${day === D().today ? 'Today' : niceDate(day, { weekday: 'long', month: 'short', day: 'numeric' })}</span></div>` : '';
    lastDay = day;
    const a = m.role === 'assistant';
    return `${rule}<div class="msg ${a ? '' : 'you'}">${a ? henAv(34) : youAv(D().profile, 34)}<div style="flex:1;min-width:0">
      <div class="meta"><b>${a ? 'Miss Angie' : 'You'}</b><span>${t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span></div>
      <div class="text">${formatText(m.text)}</div>${a ? actionsFor(m) : ''}</div></div>`;
  }).join('') + (S.thinking ? `<div class="msg">${henAv(34)}<span class="typing"><i></i><i></i><i></i></span></div>` : '')
    + (!D().messages.length ? '<div class="mute" style="text-align:center;margin-top:40px;line-height:1.6">Say hello. Tell her about your family,<br>your week, or what\'s for dinner.</div>' : '');
}

export function renderChat() {
  if (!S.chatOpen) { chatEl?.remove(); chatEl = null; return; }
  if (!chatEl) {
    chatEl = document.createElement('div'); chatEl.className = 'overlay'; chatEl.id = 'chat';
    chatEl.innerHTML = `<div class="chat-head"><button class="icon-btn" data-action="chat-close" aria-label="Back home">${DOWN}</button>
      ${henAv(40, true)}<div style="flex:1"><div class="serif" style="font-size:23px;line-height:1">Miss Angie</div><div class="mute" id="chat-status" style="font-size:12px;margin-top:2px"></div></div></div>
      <div class="chat-body" id="chat-body"></div>
      <form class="chat-foot" data-form="ask"><button type="button" class="icon-btn" data-action="chat-photo" aria-label="Send a photo">+</button>
        <input name="text" id="chat-input" placeholder="${placeholder()}" autocomplete="off" enterkeyhint="send">
        <button type="button" class="mic" data-action="voice" aria-label="Talk">${MIC}</button></form>`;
    document.body.append(chatEl);
    // Swipe down on the header to go back home.
    let y0 = null;
    chatEl.querySelector('.chat-head').addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    chatEl.querySelector('.chat-head').addEventListener('touchend', (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 60) closeChat(); y0 = null; });
  }
  chatEl.querySelector('#chat-status').textContent = status();
  const body = chatEl.querySelector('#chat-body');
  body.innerHTML = chatBody();
  body.scrollTop = body.scrollHeight;
}

function openChat() { S.chatOpen = true; renderChat(); }
function closeChat() { S.chatOpen = false; renderChat(); rerender(); }

// ===== PULSE: sending a message =====
export async function send(text, { fromMessage, choice, speak = false } = {}) {
  text = text.trim();
  if (!text || S.thinking) return;
  // Show her message right away, then wait for Angie.
  D().messages.push({ id: -1, role: 'user', text, meta: {}, created_at: new Date().toISOString() });
  S.thinking = true; rerender(); renderChat();
  try {
    const { messages } = await post('/chat', { text, fromMessage, choice });
    if (speak && messages?.length) say(messages.map((m) => m.text).join(' '));
  } catch (err) { toast(err.message); }
  S.thinking = false;
  await refresh(); renderChat();
}

// ===== Voice: listen with the phone's speech recognition, answer out loud =====
function say(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  u.voice = voices.find((v) => /Samantha|Karen|Moira|Serena|Google US English/i.test(v.name)) || voices.find((v) => v.lang?.startsWith('en')) || null;
  u.rate = 1; u.pitch = 1.05;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

let rec = null;
function voice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast("This phone's browser can't listen yet. Try typing, or use the keyboard's mic button."); document.querySelector('#chat-input, #ask-input')?.focus(); return; }
  let heard = '';
  const sheet = openSheet(`<div class="voice"><div class="ring">${HEN}</div>
    <div class="serif" style="font-size:26px;margin-top:20px">Listening…</div>
    <div class="heard" id="heard">Go ahead, I'm listening.</div>
    <div class="btns" style="margin-top:18px"><button class="btn" data-action="voice-type">Type instead</button><button class="btn solid" data-action="voice-done">Done</button></div></div>`,
  { onClose: () => { try { rec?.stop(); } catch {} rec = null; } });
  rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = true;
  rec.onresult = (e) => {
    heard = [...e.results].map((r) => r[0].transcript).join(' ').trim();
    const el = sheet.querySelector('#heard'); if (el) el.textContent = `“${heard}”`;
  };
  rec.onerror = (e) => { if (e.error === 'not-allowed') toast('Miss Angie needs permission to use the microphone.'); };
  sheet.dataset.heard = '';
  rec.onend = () => { sheet.dataset.heard = heard; };
  register({ 'voice-done': () => { const text = heard; try { rec?.stop(); } catch {} rec = null; closeSheet(); if (text) send(text, { speak: true }); } });
  try { rec.start(); } catch {}
}

// ===== ACTIONS =====
register({
  'chat-open': openChat,
  'chat-close': closeChat,
  'voice': voice,
  'voice-type': () => { closeSheet(); (document.querySelector('#chat-input') || document.querySelector('#ask-input'))?.focus(); },
  'choose': (el) => {
    const choice = el.dataset.choice;
    if (choice === 'Share a haiku') return haikuComposer({ fromMessage: el.dataset.mid });
    send(choice, { fromMessage: Number(el.dataset.mid), choice });
  },
  'decide': async (el) => {
    closeSheet(); S.thinking = true; rerender(); renderChat();
    try { await patch(`/decisions/${el.dataset.id}`, { status: 'approved' }); } catch (err) { toast(err.message); }
    S.thinking = false; await refresh(); renderChat();
  },
  'decide-other': (el) => openSheet(`<h2>What would you rather do?</h2>
    <div class="field"><textarea class="input" rows="3" name="idea" placeholder="Skip the party, he can go to soccer…"></textarea></div>
    <button class="btn solid wide" style="margin-top:14px" data-action="decide-send" data-id="${el.dataset.id}">Tell Miss Angie</button>`),
  'decide-send': async (el) => {
    const { idea } = formData(el.closest('.sheet'));
    if (!idea) return;
    closeSheet(); S.thinking = true; rerender(); renderChat();
    try { await patch(`/decisions/${el.dataset.id}`, { status: 'declined', idea }); } catch (err) { toast(err.message); }
    S.thinking = false; await refresh(); renderChat();
  },
  'haiku-save': async (el) => {
    const f = formData(el.closest('.sheet'));
    const lines = [f.l1, f.l2, f.l3].filter(Boolean);
    if (lines.length < 3) return toast('Three lines, please.');
    closeSheet();
    if (el.dataset.from && D().aiAwake) {
      // Share it in the Sunday conversation; Angie saves it and asks about the loading screen.
      await send(`Here's one I wrote:\n${lines.join('\n')}`, { fromMessage: Number(el.dataset.from), choice: 'Share a haiku' });
    } else {
      await post('/haiku', { lines, queued: f.queued });
      toast(f.queued ? "Saved. It'll greet you tomorrow morning." : 'Saved to your notebook.');
      const { loadHaiku } = await import('./views.js'); await loadHaiku(); refresh();
    }
  },
  'chat-photo': async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    toast('Miss Angie is having a look…', 6000);
    try {
      const { items } = await post('/fridge/scan', { image: await shrinkImage(file) });
      await send(items.length ? `I just sent you a photo. You found: ${items.map((i) => i.name).join(', ')}.` : 'I sent a photo but you couldn\'t make anything out.');
    } catch (err) { toast(err.message); }
  },
  'decision-open': (el) => decisionSheet(el.dataset.id),
});

// Typing in either box and pressing enter sends.
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form="ask"]');
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector('input[name="text"]');
  const text = input.value; input.value = '';
  send(text);
});
