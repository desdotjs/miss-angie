// =====================================================================
// app.js: where everything starts.
//   INIT: log in -> (first time: say hello) -> the daily haiku -> the app
//   DRAW: render the current screen, the ink spray, and the dock
// =====================================================================

// ===== IMPORTS =====
import { S, ACTIONS, register, setRender, refresh, rerender } from './store.js';
import { get, post, put } from './api.js';
import { applyTheme, timeOfDay, fetchWeather, weatherIcon, locate } from './theme.js';
import { HEN, SPRAYS } from './art.js';
import { esc, ICON, svgIcon, toast, closeSheet } from './ui.js';
import { VIEWS, loadHaiku } from './views.js';
import { angieCard, renderChat } from './chat.js';

const app = document.getElementById('app');
const MAIN_TABS = ['home', 'family', 'fridge', 'me'];

// ===== DRAW =====
function tabs() {
  const names = { home: 'Home', family: 'Family', fridge: 'Fridge', me: 'Me' };
  const current = S.route === 'notebook' || S.route === 'profile' ? 'me' : S.route;
  return `<nav class="tabs">${MAIN_TABS.map((t) => `<button class="tab ${current === t ? 'on' : ''}" data-action="go" data-to="${t}">
    ${svgIcon(ICON[names[t]])}${names[t]}<span class="pip"></span></button>`).join('')}</nav>`;
}

function render() {
  if (!S.data) return;
  // Keep whatever she was typing in the dock while the page redraws.
  const keep = document.getElementById('ask-input');
  const kept = keep ? { value: keep.value, focused: document.activeElement === keep } : null;

  const view = VIEWS[S.route] || VIEWS.home;
  app.innerHTML = `${S.route === 'home' ? `<div class="spray">${SPRAYS[timeOfDay()] || ''}</div>` : ''}
    <main class="screen">${view()}</main>
    ${S.route === 'profile' ? '' : `<div class="dock">${angieCard(S.route !== 'home')}${tabs()}</div>`}`;

  const dock = app.querySelector('.dock');
  document.documentElement.style.setProperty('--dock', `${dock ? dock.offsetHeight : 0}px`);
  const inp = document.getElementById('ask-input');
  if (kept && inp) {
    inp.value = kept.value;
    if (kept.focused) inp.focus();
  }
  // Bind text fields on the profile screen to the draft.
  app.querySelectorAll('[data-bind]').forEach((i) => i.addEventListener('input', () => { S.draft[i.dataset.bind] = i.value; }));
}
setRender(render);

// ===== ROUTER (#/home, #/family, ...) =====
function route() {
  S.route = (location.hash.replace('#/', '') || 'home').split('?')[0];
  if (S.route === 'notebook' && !S.haiku.length) loadHaiku();
  closeSheet();
  render();
  scrollTo(0, 0);
}
addEventListener('hashchange', route);

// ===== One click handler for the whole app =====
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  Promise.resolve(fn(el, e)).catch((err) => toast(err.message));
});
document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form="grocery-add"]');
  if (!form) return;
  e.preventDefault();
  const name = form.name.value.trim();
  if (!name) return;
  await post('/groceries', { name });
  await refresh();
  document.querySelector('[data-form="grocery-add"] input')?.focus();
});
register({ 'close-sheet': () => closeSheet() });

// ===== Weather corner =====
async function loadWeather() {
  try {
    let loc = S.data.location;
    const here = await locate();
    if (here && (Math.abs(here.lat - loc.lat) > 0.05 || Math.abs(here.lon - loc.lon) > 0.05)) {
      loc = { ...here, label: '' };
      put('/settings', { location: loc }).catch(() => {});
    }
    const w = await fetchWeather(loc, S.data.angie.tempUnit);
    S.wx = { temp: w.temp, svg: weatherIcon(w.code, timeOfDay()) };
    render();
  } catch { /* no weather today; the corner just stays empty */ }
}
addEventListener('weather', loadWeather);

// ===== Notifications =====
function urlBase64ToUint8Array(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
register({
  'push-on': async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return toast('On iPhone: tap Share, then "Add to Home Screen", and open Miss Angie from there first.', 6000);
    }
    if (Notification.permission === 'granted') { await post('/push/test'); return toast('Sent a test notification.'); }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Notifications are off. You can change that in Settings.');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(S.data.push.key) });
    await post('/push/subscribe', sub.toJSON());
    await post('/push/test');
    toast("Notifications are on."); render();
  },
});

// ===== The daily haiku (loading screen) =====
async function splash() {
  const now = new Date();
  const slot = now.getHours() < 17 ? 1 : 2;
  const key = `ma-splash-${S.data.today}-${slot}`;
  let seen = false;
  try { seen = localStorage.getItem(key) === '1'; } catch {}
  if (seen && !new URLSearchParams(location.search).has('splash')) return;

  const el = document.createElement('div');
  el.className = 'splash';
  el.innerHTML = `<div class="spray-top">${SPRAYS[timeOfDay()] || ''}</div>
    <div class="hen-wrap">${HEN}</div><div class="brand">MISS ANGIE</div>
    <div class="poem" id="poem">&nbsp;<br>&nbsp;<br>&nbsp;</div><div class="rule"></div><div class="count" id="count">today's haiku</div>
    <div class="bar"><i></i></div><div class="status">${slot === 1 ? 'Getting your day ready…' : 'Settling in for the evening…'}</div>`;
  document.body.append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => { el.querySelector('.bar i').style.width = '100%'; }));

  const started = Date.now();
  try {
    const h = await get('/haiku/today');
    el.querySelector('#poem').innerHTML = h.lines.map(esc).join('<br>');
    el.querySelector('#count').textContent = h.author === 'mom' ? 'written by you' : `today's haiku · ${h.slot} of 2`;
  } catch { el.querySelector('#poem').textContent = ''; }
  // Give her time to actually read it: at least ~5 seconds, or tap to continue.
  const wait = Math.max(0, 5200 - (Date.now() - started));
  await new Promise((r) => { const t = setTimeout(r, wait); el.addEventListener('click', () => { clearTimeout(t); r(); }, { once: true }); });
  try { localStorage.setItem(key, '1'); } catch {}
  el.classList.add('out');
  setTimeout(() => el.remove(), 700);
}

// ===== Login & first hello =====
function login(message = '') {
  app.innerHTML = `<div class="gate"><div class="hen-wrap">${HEN}</div><h1>Miss Angie</h1><p>Your family secretary.</p>
    <form id="login"><input class="input" type="password" name="passcode" placeholder="Passcode" autocomplete="current-password" style="margin-top:26px">
    <div class="err">${esc(message)}</div><button class="btn solid wide" style="margin-top:6px">Come in</button></form></div>`;
  app.querySelector('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await post('/login', { passcode: e.target.passcode.value }); start(); }
    catch (err) { login(err.message === 'login' ? "That passcode isn't right." : err.message); }
  });
}

function onboard() {
  app.innerHTML = `<div class="gate" style="padding-top:12vh"><div class="hen-wrap">${HEN}</div><h1>Hello, love.</h1>
    <p>I'm Miss Angie. I'll keep track of the family, the fridge and the calendar, so you don't have to hold it all in your head.</p>
    <form id="hello" style="text-align:left;margin-top:24px">
      <label class="cap">Your name</label><input class="input" name="name" autocomplete="given-name" required>
      <label class="cap" style="display:block;margin-top:14px">What should I call you?</label><input class="input" name="nickname" placeholder="Mom, Mama, your name…">
      <button class="btn solid wide" style="margin-top:22px">Nice to meet you</button></form></div>`;
  app.querySelector('#hello').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    const nickname = e.target.nickname.value.trim() || name;
    await put('/settings', { profile: { name, nickname }, system: { onboarded: true } });
    start();
  });
}

// ===== INIT =====
async function start() {
  applyTheme();
  try { await refresh(); } catch (err) { if (err.login) return login(); return login(err.message); }
  if (!S.data.system.onboarded) return onboard();
  route();
  splash();
  loadWeather();
  renderChat();
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// Every minute: shift colors with the time of day, and pick up anything Angie did on her own.
setInterval(async () => {
  const before = document.documentElement.dataset.time;
  if (applyTheme() !== before) render();
  if (document.visibilityState === 'visible' && S.data && !S.thinking && !document.querySelector('.sheet') && document.activeElement?.tagName !== 'INPUT') {
    await refresh().catch(() => {}); renderChat();
  }
}, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.data) refresh().then(renderChat).catch(() => {}); });

start();
