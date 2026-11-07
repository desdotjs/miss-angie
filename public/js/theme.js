// =====================================================================
// theme.js: time of day, the moon, and the weather corner.
// =====================================================================

import { WEATHER } from './art.js';

// ===== Time of day =====
export function timeOfDay(d = new Date()) {
  const forced = new URLSearchParams(location.search).get('time'); // ?time=night for testing
  if (forced) return forced;
  const h = d.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

const PAPER = { morning: '#F3EEE3', afternoon: '#EFE6D6', evening: '#EADCCF', night: '#3A4256' };
export function applyTheme() {
  const t = timeOfDay();
  document.documentElement.dataset.time = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAPER[t]);
  return t;
}

export const GREETING = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Good night' };

// ===== The moon (drawn in tonight's real phase) =====
export function moonPhase(d = new Date()) {
  const ref = Date.UTC(2000, 0, 6, 18, 14); // a known new moon
  const days = (d.getTime() - ref) / 86400000;
  return ((days / 29.530588853) % 1 + 1) % 1; // 0 = new, 0.5 = full
}

export function moonSVG(p = moonPhase()) {
  const r = 40, c = 50;
  const rx = Math.abs(Math.cos(2 * Math.PI * p)) * r;
  const waxing = p < 0.5;
  const limb = waxing ? 1 : 0;
  const term = waxing ? (p < 0.25 ? 0 : 1) : (p > 0.75 ? 1 : 0);
  let lit = '';
  if (Math.abs(p - 0.5) < 0.01) lit = `<circle cx="${c}" cy="${c}" r="${r}" fill="currentColor"/>`;
  else if (p > 0.01 && p < 0.99) lit = `<path d="M${c} ${c - r} A${r} ${r} 0 0 ${limb} ${c} ${c + r} A${rx.toFixed(2)} ${r} 0 0 ${term} ${c} ${c - r} Z" fill="currentColor"/>`;
  return `<svg viewBox="0 0 100 100"><circle cx="${c}" cy="${c}" r="${r}" fill="currentColor" fill-opacity=".13" stroke="currentColor" stroke-width="3" stroke-opacity=".5"/>${lit}</svg>`;
}

// ===== Weather (Open-Meteo: free, no key needed) =====
let cache = null;
export async function fetchWeather({ lat, lon }, unit = 'F') {
  if (cache && Date.now() - cache.at < 15 * 60 * 1000 && cache.unit === unit) return cache;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&temperature_unit=${unit === 'C' ? 'celsius' : 'fahrenheit'}`;
  const res = await fetch(url);
  const j = await res.json();
  cache = { at: Date.now(), unit, temp: Math.round(j.current.temperature_2m), code: j.current.weather_code, isDay: j.current.is_day };
  return cache;
}

export function weatherIcon(code, time) {
  let kind = 'cloud';
  if (code === 0 || code === 1) kind = time === 'evening' ? 'sunset' : 'sun';
  else if (code === 2) kind = 'partly';
  else if ([3, 45, 48].includes(code)) kind = 'cloud';
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) kind = 'snow';
  else if (code >= 51) kind = 'rain';
  return WEATHER[kind];
}

// Ask the phone where we are (once); fall back to the saved location.
export function locate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) }),
      () => resolve(null), { timeout: 8000, maximumAge: 6 * 3600 * 1000 });
  });
}
