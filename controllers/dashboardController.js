const Event = require('../models/eventModel');
const Match = require('../models/matchModel');

async function index(req, res, next) {
  try {
    const [stats, events, matches] = await Promise.all([
      Match.dashboardStats(),
      Event.all(),
      Match.all()
    ]);

    res.render('dashboard', {
      title: 'Dashboard',
      stats,
      events: events.slice(0, 6),
      matches: matches.slice(0, 8)
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { index };
