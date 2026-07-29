const Chicken = require('../models/chickenModel');
const Event = require('../models/eventModel');

function typeAllowed(chicken, type) {
  if (type === 'cock') return Boolean(chicken.allow_cock);
  if (type === 'stag') return Boolean(chicken.allow_stag);
  if (type === 'bullstag') return Boolean(chicken.allow_bullstag);
  return false;
}

function weightRange(chicken, type) {
  return {
    min: Number(chicken[`${type}_min_weight`]),
    max: Number(chicken[`${type}_max_weight`])
  };
}

function validateUpdate(chicken, type, weight) {
  if (chicken.status !== 'available') {
    return 'Only unmatched available Gamecocks can be modified.';
  }

  if (!['cock', 'stag', 'bullstag'].includes(type)) {
    return 'Invalid Gamecock type.';
  }

  if (!typeAllowed(chicken, type)) {
    return `${type} is not allowed for this event.`;
  }

  const range = weightRange(chicken, type);
  if (weight < range.min || weight > range.max) {
    return `${type} weight must be between ${range.min}g and ${range.max}g for this event.`;
  }

  return null;
}

async function index(req, res, next) {
  try {
    const [events, chickens] = await Promise.all([
      Event.all(),
      Chicken.all(req.query)
    ]);
    const groupedChickens = chickens.sort((a, b) => (
      a.owner_name.localeCompare(b.owner_name)
      || a.entry_name.localeCompare(b.entry_name)
      || Number(a.entry_no) - Number(b.entry_no)
      || Number(a.weight) - Number(b.weight)
    ));

    res.render('chickens/index', { title: 'Gamecocks', events, chickens: groupedChickens, filters: req.query });
  } catch (error) {
    next(error);
  }
}

async function editForm(req, res, next) {
  try {
    const chicken = await Chicken.findDetailed(req.params.id);
    if (!chicken) return res.status(404).render('error', { title: 'Not Found', message: 'Gamecock not found.' });

    res.render('chickens/edit', {
      title: 'Edit Gamecock',
      chicken,
      error: req.query.error || '',
      returnTo: req.query.return_to || '/chickens'
    });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const chicken = await Chicken.findDetailed(req.params.id);
    if (!chicken) return res.status(404).render('error', { title: 'Not Found', message: 'Gamecock not found.' });

    const returnTo = req.body.return_to || '/chickens';
    const type = req.body.type;
    const weight = Number(req.body.weight);
    const validationError = validateUpdate(chicken, type, weight);
    if (validationError) {
      return res.redirect(`/chickens/${req.params.id}/edit?return_to=${encodeURIComponent(returnTo)}&error=${encodeURIComponent(validationError)}`);
    }

    await Chicken.update(req.params.id, {
      entry_no: Number(req.body.entry_no),
      type,
      weight,
      wingband: req.body.wingband.trim(),
      legband: req.body.legband.trim()
    });
    req.io.emit('pool:updated');
    res.redirect(returnTo);
  } catch (error) {
    next(error);
  }
}

module.exports = { index, editForm, update };
