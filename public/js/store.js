// =====================================================================
// store.js: the app's STATE and the list of things buttons can do.
// Buttons say data-action="something"; ACTIONS.something runs.
// =====================================================================

import { get } from './api.js';

export const S = {
  data: null,          // everything from /api/state
  route: 'home',       // home | family | fridge | me | notebook | profile
  chatOpen: false,
  thinking: false,
  wx: null,            // { temp, svg }
  showTemp: false,     // weather corner: icon or temperature
  famDay: null,        // selected day on the Family tab
  famWho: 'all',       // filter on the Family tab
  noteFilter: 'all',   // haiku notebook filter
  haiku: [],           // haiku notebook entries
  draft: null,         // profile being edited
};

export const ACTIONS = {};
export const register = (obj) => Object.assign(ACTIONS, obj);

let renderFn = () => {};
export const setRender = (fn) => { renderFn = fn; };
export const rerender = () => renderFn();

export async function refresh() {
  S.data = await get('/state');
  rerender();
  return S.data;
}
