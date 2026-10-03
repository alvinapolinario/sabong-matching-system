// Messages between the matching system and the betting station (same server).
//
// Outgoing (matching → betting): CALL a fight (entries, owners, weights, bands)
// and RECALL it before betting opens. Each message is first written to
// bridge_outbox in the same transaction as the change, then delivered in order
// and retried until the betting station answers.
// Incoming (betting → matching): fight status (open / closed / held) and results.
//
// Signature: X-Bridge-Timestamp + X-Bridge-Signature =
// hex(HMAC-SHA256(key, timestamp + "." + raw body)), one key per direction.
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');

function enabled() {
  const b = config.bridge;
  return Boolean(b.enabled && b.bettingUrl && b.keyToBetting && b.keyFromBetting);
}

function sign(body, key) {
  const ts = String(Math.floor(Date.now() / 1000));
  return { ts, sig: crypto.createHmac('sha256', key).update(`${ts}.${body}`).digest('hex') };
}

function verify(req) {
  const key = config.bridge.keyFromBetting;
  const ts = String(req.get('X-Bridge-Timestamp') || '');
  const sig = String(req.get('X-Bridge-Signature') || '');
  if (!key || !/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > config.bridge.maxClockSkew) return false;
  const expected = crypto.createHmac('sha256', key).update(`${ts}.${req.rawBody || ''}`).digest('hex');
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/** Queue a message (pass the open transaction connection). Returns the outbox id. */
async function queue(conn, type, matchId, payload) {
  const msgKey = `matching-${type}-${matchId || 'x'}-${crypto.randomUUID()}`;
  const body = JSON.stringify({ ...payload, msg_key: msgKey, type });
  const [res] = await conn.execute(
    'INSERT INTO bridge_outbox (msg_key, type, match_id, payload) VALUES (?, ?, ?, ?)',
    [msgKey, type, matchId || null, body]
  );
  return res.insertId;
}

async function post(type, body) {
  const { ts, sig } = sign(body, config.bridge.keyToBetting);
  const response = await fetch(`${config.bridge.bettingUrl}/api/bridge/matching/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Bridge-Timestamp': ts, 'X-Bridge-Signature': sig },
    body,
    signal: AbortSignal.timeout(4000)
  });
  let json = null;
  try { json = await response.json(); } catch (e) { json = null; }
  return { status: response.status, json };
}

let flushing = null;

/**
 * Deliver pending messages in order. A refusal (4xx) is final: it is recorded
 * and delivery continues. A network error or 5xx stops here and is retried.
 */
function flush() {
  if (!enabled()) return Promise.resolve({ sent: 0, pending: 0 });
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    try {
      const [rows] = await db.execute('SELECT * FROM bridge_outbox WHERE sent_at IS NULL ORDER BY id LIMIT 50');
      for (const row of rows) {
        let result;
        try {
          result = await post(row.type, row.payload);
        } catch (error) {
          await db.execute('UPDATE bridge_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?', [String(error.message || error).slice(0, 1000), row.id]);
          break;
        }
        if (result.status >= 500) {
          await db.execute('UPDATE bridge_outbox SET attempts = attempts + 1, http_status = ?, last_error = ? WHERE id = ?',
            [result.status, String(result.json?.message || `HTTP ${result.status}`).slice(0, 1000), row.id]);
          break;
        }
        await db.execute('UPDATE bridge_outbox SET sent_at = NOW(), attempts = attempts + 1, http_status = ?, last_error = ? WHERE id = ?',
          [result.status, result.status < 300 ? null : String(result.json?.message || `HTTP ${result.status}`).slice(0, 1000), row.id]);
        sent += 1;
        if (result.status >= 300 && module.exports.onRefused) {
          await module.exports.onRefused(row, result).catch((e) => console.error('[bridge] refusal handler:', e.message));
        }
      }
    } finally {
      flushing = null;
    }
    const [[{ pending }]] = await db.execute('SELECT COUNT(*) AS pending FROM bridge_outbox WHERE sent_at IS NULL');
    return { sent, pending: Number(pending) };
  })();
  return flushing;
}

/** Outcome of one message after a flush: delivered / refused (with message) / waiting. */
async function outcome(outboxId) {
  const [[row]] = await db.execute('SELECT sent_at, http_status, last_error FROM bridge_outbox WHERE id = ?', [outboxId]);
  if (!row || !row.sent_at) return { state: 'waiting', message: row?.last_error || 'Betting station not reachable yet.' };
  if (row.http_status >= 300) return { state: 'refused', message: row.last_error || 'Refused by the betting station.' };
  return { state: 'delivered' };
}

async function status() {
  if (!enabled()) return { enabled: false };
  const [[row]] = await db.execute(
    `SELECT COUNT(*) AS pending, MIN(created_at) AS oldest,
            (SELECT last_error FROM bridge_outbox WHERE sent_at IS NULL ORDER BY id LIMIT 1) AS last_error
     FROM bridge_outbox WHERE sent_at IS NULL`
  );
  return { enabled: true, pending: Number(row.pending), oldest_pending_at: row.oldest, last_error: row.last_error };
}

function start() {
  if (!enabled()) {
    console.log('[bridge] link with the betting station is disabled');
    return;
  }
  console.log(`[bridge] link with the betting station enabled (${config.bridge.bettingUrl})`);
  setInterval(() => flush().catch((e) => console.error('[bridge] flush:', e.message)), 3000);
}

module.exports = { enabled, verify, queue, flush, outcome, status, start, onRefused: null };
