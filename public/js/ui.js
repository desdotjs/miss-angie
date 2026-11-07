// =====================================================================
// ui.js: small building blocks shared by every screen.
// =====================================================================

import { HEN, AVATARS } from './art.js';

// ===== Text safety: everything shown goes through esc() =====
export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ===== Icons =====
export const ICON = {
  Home: '<path d="M2 10.5 C6.5 9.5 9.5 6.5 12 3.5 C14.5 6.5 17.5 9.5 22 10.5"/><path d="M5.5 10 V20 H18.5 V10"/><path d="M10 20 V15 H14 V20"/>',
  Family: '<circle cx="7" cy="8" r="2.6"/><circle cx="17" cy="8" r="2.6"/><circle cx="12" cy="12.5" r="2.1"/><path d="M2.5 18 C3 14 5 12.5 7 12.5 C8 12.5 8.8 12.8 9.4 13.3"/><path d="M21.5 18 C21 14 19 12.5 17 12.5 C16 12.5 15.2 12.8 14.6 13.3"/><path d="M8.5 20 C9 17.2 10.4 16.2 12 16.2 C13.6 16.2 15 17.2 15.5 20"/>',
  Fridge: '<path d="M3 12 H21 C21 16.5 17 20 12 20 C7 20 3 16.5 3 12Z"/><path d="M14.5 3 L9.5 10.5"/><path d="M19 4 L13 10.5"/>',
  Me: [0, 1, 2, 3, 4].map((i) => `<ellipse cx="12" cy="7.2" rx="2.6" ry="3.9" transform="rotate(${i * 72} 12 12)"/>`).join('') + '<circle cx="12" cy="12" r=".9"/>',
};
export const svgIcon = (inner, size = 24) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}">${inner}</svg>`;
export const MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="8.5" y="3" width="7" height="12" rx="3.5"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="21"/></svg>';
export const UP = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
export const DOWN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
export const PEN = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
export const CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';

// ===== Faces =====
export const henAv = (size = 36, here = false) => `<div class="av" style="width:${size}px;height:${size}px">${HEN}${here ? '<span class="here"></span>' : ''}</div>`;
export function avatarFor(profile = {}, kind = profile.avatar) {
  if (profile.photo && kind === profile.avatar) return `<img src="${profile.photo}" alt="">`;
  return (AVATARS[kind] || AVATARS.blossom).replace('>N</text>', `>${esc((profile.name || 'N')[0].toUpperCase())}</text>`);
}
export const youAv = (profile, size = 20) => `<div class="you-dot" style="width:${size}px;height:${size}px">${avatarFor(profile)}</div>`;
export const bigAvatar = (profile) => avatarFor(profile);

// ===== Little controls =====
export const toggle = (on, action, extra = '') => `<button class="toggle ${on ? 'on' : ''}" data-action="${action}" ${extra} aria-pressed="${!!on}"></button>`;
export const row = (label, value, action, extra = '') =>
  `<button class="row" data-action="${action}" ${extra}><span class="grow">${label}</span><span class="val">${value ?? ''}</span><span class="chev">›</span></button>`;

// ===== Dates =====
const pad = (n) => String(n).padStart(2, '0');
export const iso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = fromIso(s); d.setDate(d.getDate() + n); return iso(d); };
export function niceTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)}`;
}
export const ampm = (t) => (t ? `${niceTime(t)} ${Number(t.split(':')[0]) < 12 ? 'AM' : 'PM'}` : '');
export const niceDate = (s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => fromIso(s).toLocaleDateString('en-US', opts);

// ===== Sheets (slide-up panels) =====
let onCloseSheet = null;
export function openSheet(html, { onClose } = {}) {
  closeSheet();
  const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.dataset.action = 'close-sheet';
  const sheet = document.createElement('div'); sheet.className = 'sheet'; sheet.innerHTML = `<div class="grab"></div>${html}`;
  document.body.append(scrim, sheet);
  onCloseSheet = onClose || null;
  const first = sheet.querySelector('input:not([type=hidden]), textarea');
  if (first && !first.dataset.nofocus) setTimeout(() => first.focus(), 250);
  return sheet;
}
export function closeSheet() {
  document.querySelectorAll('.scrim, .sheet').forEach((el) => el.remove());
  if (onCloseSheet) { const f = onCloseSheet; onCloseSheet = null; f(); }
}

export function toast(text, ms = 2600) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
  document.body.append(t); setTimeout(() => t.remove(), ms);
}

// Read all named fields in a sheet into an object.
export function formData(root) {
  const out = {};
  root.querySelectorAll('[name]').forEach((el) => { out[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
  return out;
}

// Shrink a photo before sending it (phones take huge pictures).
export function shrinkImage(file, max = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', quality)); URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function pickFile(accept = 'image/*', capture) {
  return new Promise((resolve) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept;
    if (capture) inp.capture = capture;
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}
