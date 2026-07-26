'use strict';
// Catalyst Push Notifications (web channel).
//
// Real path : ctx.services.push.web(message, recipients) ->
//             capp.pushNotification().web().sendNotification(message, [ids]).
// Flag      : FEATURE_PUSH (off by default — the web channel must first be
//             registered in the Catalyst console, and sending is a side effect).
// Fallback  : a no-op that logs the exact payload and returns it as `preview`,
//             so the UI can show "would have pushed X to N recipients".
//
// The recipient registry lives in Catalyst Cache (segment 'dappa'), NOT a new
// Data Store table: table creation is console-only in this project, and a
// registry that evaporates with the cache is the correct durability for a
// browser push subscription anyway.

const { logJson } = require('./util');

const REG_KEY = 'v1:push:recipients';
const REG_TTL_SEC = 7 * 24 * 3600;
const MAX_RECIPIENTS = 50;

function normalize(v) {
  return String(v === undefined || v === null ? '' : v).trim();
}

async function listRecipients(ctx) {
  const hit = await ctx.cache.get(REG_KEY).catch(() => undefined);
  const list = hit && Array.isArray(hit.value) ? hit.value : [];
  return list.filter((r) => r && r.id);
}

async function saveRecipients(ctx, list) {
  await ctx.cache.put(REG_KEY, list.slice(0, MAX_RECIPIENTS), REG_TTL_SEC);
  return list;
}

/**
 * Register a web-push recipient. `id` is the Catalyst user id / email the
 * console-registered web app pushes to; `label` is free-text for the admin UI.
 */
async function registerRecipient(ctx, body) {
  const b = body || {};
  const id = normalize(b.recipient || b.id || b.userId || b.email);
  if (!id) return { ok: false, reason: 'recipient required' };
  const list = await listRecipients(ctx);
  const existing = list.find((r) => r.id === id);
  const entry = {
    id,
    label: normalize(b.label) || id,
    channel: normalize(b.channel) || 'web',
    registeredAt: existing ? existing.registeredAt : new Date().toISOString()
  };
  const next = list.filter((r) => r.id !== id).concat([entry]);
  if (next.length > MAX_RECIPIENTS) return { ok: false, reason: `registry full (max ${MAX_RECIPIENTS})` };
  await saveRecipients(ctx, next);
  return { ok: true, recipient: entry, registered: next.length, alreadyRegistered: Boolean(existing) };
}

async function unregisterRecipient(ctx, id) {
  const key = normalize(id);
  const list = await listRecipients(ctx);
  const next = list.filter((r) => r.id !== key);
  await saveRecipients(ctx, next);
  return { ok: true, removed: list.length - next.length, registered: next.length };
}

/**
 * Push `message` to the given ids (default: the whole registry).
 * Never throws — a failed push degrades to the logged preview.
 */
async function sendPush(ctx, message, opts) {
  const o = opts || {};
  const text = String(message || '').trim();
  const registry = await listRecipients(ctx);
  const ids = (Array.isArray(o.recipients) && o.recipients.length
    ? o.recipients.map(normalize).filter(Boolean)
    : registry.map((r) => r.id));
  const preview = { message: text, recipients: ids, reason: o.reason || null };

  if (!text) return { sent: false, mode: 'empty-message', preview, source: 'fallback-local' };
  if (!ctx.flags.push || !ctx.services.push) {
    logJson('info', 'push_preview', { mode: 'disabled', recipients: ids.length, message: text });
    return { sent: false, mode: 'disabled', delivered: 0, preview, source: 'fallback-local' };
  }
  if (!ids.length) {
    logJson('info', 'push_preview', { mode: 'no-recipients', message: text });
    return { sent: false, mode: 'no-recipients', delivered: 0, preview, source: 'fallback-local' };
  }
  try {
    await ctx.services.push.web(text, ids);
    return { sent: true, mode: 'sent', delivered: ids.length, preview, source: 'catalyst-push' };
  } catch (e) {
    logJson('warn', 'push_failed', { message: String((e && e.message) || e), recipients: ids.length });
    return {
      sent: false, mode: 'error-fallback', delivered: 0, preview,
      source: 'fallback-local', error: String((e && e.message) || e)
    };
  }
}

module.exports = { listRecipients, registerRecipient, unregisterRecipient, sendPush, REG_KEY, MAX_RECIPIENTS };
