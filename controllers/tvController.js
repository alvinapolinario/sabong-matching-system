const Match = require('../models/matchModel');

async function side(req, res, next, forcedSide) {
  try {
    const sideName = forcedSide === 'wala' ? 'wala' : 'meron';
    const data = await Match.activeTvCard(sideName, req.query.event_id);

    res.render('tv/side', {
      title: `TV ${sideName.toUpperCase()}`,
      side: sideName,
      data
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { side };
