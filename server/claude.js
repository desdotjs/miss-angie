// =====================================================================
// claude.js: one shared connection to the Claude API.
// If there's no API key, `claude` is null and Angie falls back to
// simple built-in behavior so the app still works.
// =====================================================================

import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
export const claude = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

// Pull plain text out of a Claude response.
export const textOf = (res) => res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

// Pull the first {...} JSON object out of a text reply.
export function jsonOf(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON in reply');
  return JSON.parse(m[0]);
}
