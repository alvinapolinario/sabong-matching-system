const Event = require('../models/eventModel');
const Match = require('../models/matchModel');

async function board(req, res, next) {
  try {
    const events = await Event.all();
    const selectedEvent = req.query.event_id || events[0]?.event_id || '';
    const matches = selectedEvent ? await Match.all(selectedEvent) : [];
    res.render('live/board', { title: 'Live Match Board', events, selectedEvent, matches });
  } catch (error) {
    next(error);
  }
}

module.exports = { board };
