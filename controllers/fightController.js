const Event = require('../models/eventModel');
const Match = require('../models/matchModel');
const bridge = require('../services/bettingBridge');
const flow = require('../services/fightBridgeService');
const {
  emitFightsUpdated,
  emitTvUpdated,
  emitPoolUpdated
} = require('../socket/events');

async function index(req, res, next) {
  try {
    const events = await Event.all();
    const selectedEvent = req.query.event_id || events[0]?.event_id || '';
    const [matches, scores] = selectedEvent
      ? await Promise.all([Match.all(selectedEvent), Match.scoreSummary(selectedEvent)])
      : [[], []];
    res.render('fights/index', { title: 'Fight Schedule', events, selectedEvent, matches, scores });
  } catch (error) {
    next(error);
  }
}

async function apiSchedule(req, res, next) {
  try {
    const eventId = req.query.event_id;
    if (!eventId) {
      return res.status(422).json({ ok: false, message: 'Select an event first.' });
    }

    const [matches, scores] = await Promise.all([
      Match.all(eventId),
      Match.scoreSummary(eventId)
    ]);

    res.json({ ok: true, matches, scores });
  } catch (error) {
    next(error);
  }
}

async function updateStatus(req, res, next) {
  try {
    const match = await Match.updateStatus(req.params.id, req.body.status);
    emitFightsUpdated(req.io, match.event_id);
    if (req.accepts('json') && !req.accepts('html')) {
      return res.json({ ok: true, message: 'Fight status updated.' });
    }
    res.redirect(req.get('referer') || '/fights');
  } catch (error) {
    next(error);
  }
}

async function reorder(req, res, next) {
  try {
    const eventId = Number(req.body.event_id);
    const matchIds = Array.isArray(req.body.match_ids) ? req.body.match_ids : [];

    if (!eventId || !matchIds.length) {
      return res.status(422).json({ ok: false, message: 'Missing event or fight order.' });
    }

    await Match.reorder(eventId, matchIds);
    emitFightsUpdated(req.io, eventId);
    res.json({ ok: true, message: 'Fight order saved.' });
  } catch (error) {
    res.status(error.status || 500).json({
      ok: false,
      message: error.message || 'Unable to save fight order.'
    });
  }
}

async function updateResult(req, res, next) {
  try {
    const match = await Match.updateResult(req.params.id, req.body.result);
    emitFightsUpdated(req.io, match.event_id);
    emitPoolUpdated(req.io, match.event_id);
    emitTvUpdated(req.io, match.event_id);
    if (req.accepts('json') && !req.accepts('html')) {
      return res.json({ ok: true, message: 'Fight result updated.' });
    }
    res.redirect(req.get('referer') || '/fights');
  } catch (error) {
    next(error);
  }
}

function wantsJson(req) {
  return req.accepts('json') && !req.accepts('html');
}

function reply(req, res, status, message, ok = status < 300) {
  if (wantsJson(req)) return res.status(status).json({ ok, message });
  res.redirect(req.get('referer') || '/fights');
}

/** Send a queued call/recall now and tell the operator what the betting station said. */
async function deliver(req, res, eventId, outboxId, okMessage) {
  await bridge.flush().catch(() => null);
  const outcome = await bridge.outcome(outboxId);
  emitFightsUpdated(req.io, eventId);
  emitTvUpdated(req.io, eventId);
  if (outcome.state === 'refused') return reply(req, res, 409, `Betting station refused: ${outcome.message}`, false);
  if (outcome.state === 'waiting') return reply(req, res, 202, `${okMessage} Waiting for the betting station (will retry automatically): ${outcome.message}`);
  return reply(req, res, 200, okMessage);
}

/** CALL the fight (link on) / make it the active TV fight (link off). */
async function setActive(req, res, next) {
  try {
    if (bridge.enabled()) {
      const { match, outboxId } = await flow.call(req.params.id);
      return deliver(req, res, match.event_id, outboxId, `Fight #${match.fight_no} called and sent to the betting station.`);
    }
    const match = await Match.setActiveFight(req.params.id);
    emitTvUpdated(req.io, match.event_id);
    emitFightsUpdated(req.io, match.event_id);
    if (req.accepts('json') && !req.accepts('html')) {
      return res.json({ ok: true, message: 'Active TV fight updated.' });
    }
    res.redirect(req.get('referer') || '/fights');
  } catch (error) {
    next(error);
  }
}

async function setTvMeron(req, res, next) {
  try {
    const match = await Match.setTvMeron(req.params.id, req.body.chicken_id);
    if (bridge.enabled() && ['called', 'held'].includes(match.bet_state)) {
      const { outboxId } = await flow.resend(req.params.id);
      return deliver(req, res, match.event_id, outboxId, `Meron side changed; fight #${match.fight_no} re-sent to the betting station.`);
    }
    emitTvUpdated(req.io, match.event_id);
    emitFightsUpdated(req.io, match.event_id);
    if (req.accepts('json') && !req.accepts('html')) {
      return res.json({ ok: true, message: 'TV side updated.' });
    }
    res.redirect(req.get('referer') || '/fights');
  } catch (error) {
    next(error);
  }
}

async function recall(req, res, next) {
  try {
    const { match, outboxId } = await flow.recall(req.params.id, (req.body || {}).reason);
    return deliver(req, res, match.event_id, outboxId, `Fight #${match.fight_no} recalled from the betting station.`);
  } catch (error) {
    next(error);
  }
}

async function resend(req, res, next) {
  try {
    const { match, outboxId } = await flow.resend(req.params.id);
    return deliver(req, res, match.event_id, outboxId, `Fight #${match.fight_no} re-sent to the betting station.`);
  } catch (error) {
    next(error);
  }
}

/** Optional fight duration, "m:ss" (empty clears it). */
async function setDuration(req, res, next) {
  try {
    const raw = String((req.body || {}).duration || '').trim();
    let seconds = null;
    if (raw) {
      const m = /^(\d{1,2}):([0-5]\d)$/.exec(raw);
      if (!m) {
        const error = new Error('Enter the duration as m:ss, e.g. 2:35.');
        error.status = 422;
        throw error;
      }
      seconds = Number(m[1]) * 60 + Number(m[2]);
    }
    const match = await flow.setDuration(req.params.id, seconds);
    emitFightsUpdated(req.io, match.event_id);
    emitTvUpdated(req.io, match.event_id);
    return reply(req, res, 200, `Fight #${match.fight_no} duration saved.`);
  } catch (error) {
    next(error);
  }
}

async function bridgeStatus(req, res, next) {
  try {
    res.json(await bridge.status());
  } catch (error) {
    next(error);
  }
}

async function rematch(req, res, next) {
  try {
    const out = await Match.rematch(req.params.id, (req.body || {}).reason);
    emitFightsUpdated(req.io, out.event_id);
    emitPoolUpdated(req.io, out.event_id);
    return reply(req, res, 201, `Fight #${out.original_fight_no} will be fought again as fight #${out.fight_no}. Call it when the cocks are ready.`);
  } catch (error) {
    next(error);
  }
}

module.exports = { index, apiSchedule, updateStatus, updateResult, setActive, setTvMeron, reorder, recall, resend, setDuration, bridgeStatus, rematch };
