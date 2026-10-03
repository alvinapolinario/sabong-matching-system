// Messages from the betting station (same server), signed with the shared key.
const router = require('express').Router();
const db = require('../db');
const bridge = require('../services/bettingBridge');
const flow = require('../services/fightBridgeService');
const { emitFightsUpdated, emitTvUpdated, emitPoolUpdated } = require('../socket/events');

function handler(type, apply) {
  return async (req, res) => {
    if (!bridge.enabled()) return res.status(503).json({ ok: false, message: 'Link with the betting station is disabled on matching.' });
    if (!bridge.verify(req)) return res.status(401).json({ ok: false, message: 'Invalid signature.' });
    const m = req.body || {};
    const key = String(m.msg_key || '');
    if (!key || key.length > 100) return res.status(422).json({ ok: false, message: 'Missing msg_key.' });

    const [seen] = await db.execute('SELECT http_status, response FROM bridge_inbox WHERE msg_key = ?', [key]);
    if (seen[0]) return res.status(seen[0].http_status).type('application/json').send(seen[0].response);

    let status = 200;
    let body;
    let eventId = null;
    try {
      const out = await apply(m);
      eventId = out.match?.event_id;
      body = { ok: true, message: out.message };
    } catch (error) {
      status = error.status && error.status < 500 ? error.status : 500;
      body = { ok: false, message: status === 500 ? `Matching error: ${error.message}` : error.message };
      if (status === 500) console.error(`[bridge] ${type}:`, error);
    }
    if (status < 500) {
      await db.execute('INSERT IGNORE INTO bridge_inbox (msg_key, type, payload, http_status, response) VALUES (?, ?, ?, ?, ?)',
        [key, type, JSON.stringify(m), status, JSON.stringify(body)]);
    }
    if (eventId) {
      emitFightsUpdated(req.io, eventId);
      emitTvUpdated(req.io, eventId);
      if (type === 'result') emitPoolUpdated(req.io, eventId);
    }
    res.status(status).json(body);
  };
}

router.post('/betting/status', handler('status', flow.applyStatus));
router.post('/betting/result', handler('result', flow.applyResult));

module.exports = router;
