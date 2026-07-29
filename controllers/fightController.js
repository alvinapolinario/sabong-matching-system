const Event = require('../models/eventModel');
const Match = require('../models/matchModel');

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

async function updateStatus(req, res, next) {
  try {
    await Match.updateStatus(req.params.id, req.body.status);
    req.io.emit('matches:updated');
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
    req.io.to(`event:${eventId}`).emit('matches:updated', { event_id: eventId });
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
    await Match.updateResult(req.params.id, req.body.result);
    req.io.emit('matches:updated');
    res.redirect(req.get('referer') || '/fights');
  } catch (error) {
    next(error);
  }
}

async function setActive(req, res, next) {
  try {
    const match = await Match.setActiveFight(req.params.id);
    req.io.emit('tv:updated', { event_id: match.event_id });
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
    req.io.emit('tv:updated', { event_id: match.event_id });
    if (req.accepts('json') && !req.accepts('html')) {
      return res.json({ ok: true, message: 'TV side updated.' });
    }
    res.redirect(req.get('referer') || '/fights');
  } catch (error) {
    next(error);
  }
}

module.exports = { index, updateStatus, updateResult, setActive, setTvMeron, reorder };
