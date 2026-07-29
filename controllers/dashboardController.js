const Event = require('../models/eventModel');
const Match = require('../models/matchModel');
const Backup = require('../services/backupService');

async function index(req, res, next) {
  try {
    const [stats, events, matches, backups] = await Promise.all([
      Match.dashboardStats(),
      Event.all(),
      Match.all(),
      Backup.listBackups()
    ]);

    res.render('dashboard', {
      title: 'Dashboard',
      stats,
      events: events.slice(0, 6),
      matches: matches.slice(0, 8),
      backupCount: backups.length,
      latestBackup: backups[0] || null
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { index };
