const Event = require('../models/eventModel');

function normalize(body) {
  return {
    event_name: body.event_name?.trim(),
    event_date: body.event_date,
    venue: body.venue?.trim(),
    give_take_grams: Number(body.give_take_grams || 0),
    cock_min_weight: Number(body.cock_min_weight || 0),
    cock_max_weight: Number(body.cock_max_weight || 0),
    stag_min_weight: Number(body.stag_min_weight || 0),
    stag_max_weight: Number(body.stag_max_weight || 0),
    bullstag_min_weight: Number(body.bullstag_min_weight || 0),
    bullstag_max_weight: Number(body.bullstag_max_weight || 0),
    allow_cock: body.allow_cock ? 1 : 0,
    allow_stag: body.allow_stag ? 1 : 0,
    allow_bullstag: body.allow_bullstag ? 1 : 0,
    status: body.status || 'open'
  };
}

async function index(req, res, next) {
  try {
    res.render('events/index', { title: 'Events', events: await Event.all() });
  } catch (error) {
    next(error);
  }
}

function createForm(req, res) {
  res.render('events/form', {
    title: 'New Event',
    event: {
      give_take_grams: 30,
      cock_min_weight: 1800,
      cock_max_weight: 2600,
      stag_min_weight: 1600,
      stag_max_weight: 2300,
      bullstag_min_weight: 1700,
      bullstag_max_weight: 2400,
      allow_cock: 1,
      allow_stag: 1,
      allow_bullstag: 1,
      status: 'open'
    },
    action: '/events'
  });
}

async function store(req, res, next) {
  try {
    await Event.create(normalize(req.body));
    res.redirect('/events');
  } catch (error) {
    next(error);
  }
}

async function editForm(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).render('error', { title: 'Not Found', message: 'Event not found.' });
    res.render('events/form', { title: 'Edit Event', event, action: `/events/${event.event_id}?_method=PUT` });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    await Event.update(req.params.id, normalize(req.body));
    res.redirect('/events');
  } catch (error) {
    next(error);
  }
}

async function destroy(req, res, next) {
  try {
    await Event.remove(req.params.id);
    res.redirect('/events');
  } catch (error) {
    next(error);
  }
}

module.exports = { index, createForm, store, editForm, update, destroy };
