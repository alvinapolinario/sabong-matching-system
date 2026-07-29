const Entry = require('../models/entryModel');
const Event = require('../models/eventModel');
const Owner = require('../models/ownerModel');

function typeAllowed(entry, type) {
  if (type === 'cock') return Boolean(entry.allow_cock);
  if (type === 'stag') return Boolean(entry.allow_stag);
  if (type === 'bullstag') return Boolean(entry.allow_bullstag);
  return false;
}

function weightRange(entry, type) {
  return {
    min: Number(entry[`${type}_min_weight`]),
    max: Number(entry[`${type}_max_weight`])
  };
}

function validateChickenForEntry(entry, type, weight) {
  if (!['cock', 'stag', 'bullstag'].includes(type)) {
    return 'Invalid Gamecock type.';
  }

  if (!typeAllowed(entry, type)) {
    return `${type} is not allowed for this event.`;
  }

  const range = weightRange(entry, type);
  if (weight < range.min || weight > range.max) {
    return `${type} weight must be between ${range.min}g and ${range.max}g for this event.`;
  }

  return null;
}

async function index(req, res, next) {
  try {
    const [events, entries] = await Promise.all([
      Event.all(),
      Entry.all(req.query.event_id)
    ]);
    res.render('entries/index', { title: 'Entries', events, entries, selectedEvent: req.query.event_id || '' });
  } catch (error) {
    next(error);
  }
}

async function createForm(req, res, next) {
  try {
    const [events, owners] = await Promise.all([Event.all(), Owner.all()]);
    const selectedEventId = req.query.event_id || (events.length === 1 ? events[0].event_id : '');
    res.render('entries/form', {
      title: 'New Entry',
      entry: { event_id: selectedEventId, owner_id: '', entry_name: '' },
      events,
      owners,
      action: '/entries'
    });
  } catch (error) {
    next(error);
  }
}

async function store(req, res, next) {
  try {
    const entryId = await Entry.create({
      owner_id: req.body.owner_id,
      entry_name: req.body.entry_name.trim(),
      event_id: req.body.event_id
    });
    res.redirect(`/entries/${entryId}/encode`);
  } catch (error) {
    next(error);
  }
}

async function encodeForm(req, res, next) {
  try {
    const [entry, chickens] = await Promise.all([
      Entry.findById(req.params.id),
      Entry.chickens(req.params.id)
    ]);
    if (!entry) return res.status(404).render('error', { title: 'Not Found', message: 'Entry not found.' });
    const nextEntryNo = await Entry.nextEntryNo(req.params.id);
    res.render('entries/encode', {
      title: 'Entry Encoding',
      entry,
      chickens,
      nextEntryNo,
      error: req.query.error || ''
    });
  } catch (error) {
    next(error);
  }
}

async function addChicken(req, res, next) {
  try {
    const entry = await Entry.findById(req.params.id);
    if (!entry) return res.status(404).render('error', { title: 'Not Found', message: 'Entry not found.' });

    const type = req.body.type;
    const weight = Number(req.body.weight);
    const validationError = validateChickenForEntry(entry, type, weight);
    if (validationError) {
      return res.redirect(`/entries/${req.params.id}/encode?error=${encodeURIComponent(validationError)}`);
    }

    await Entry.addChicken({
      entry_id: req.params.id,
      entry_no: Number(req.body.entry_no),
      type,
      weight,
      wingband: req.body.wingband.trim(),
      legband: req.body.legband.trim(),
      status: req.body.status || 'available'
    });
    req.io.emit('pool:updated');
    res.redirect(`/entries/${req.params.id}/encode`);
  } catch (error) {
    next(error);
  }
}

module.exports = { index, createForm, store, encodeForm, addChicken };
