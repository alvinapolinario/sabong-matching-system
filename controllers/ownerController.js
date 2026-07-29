const Owner = require('../models/ownerModel');

async function index(req, res, next) {
  try {
    const [owners, noFightPairs] = await Promise.all([
      Owner.all(),
      Owner.noFightPairs()
    ]);
    res.render('owners/index', {
      title: 'Owners',
      owners,
      noFightPairs,
      error: req.query.error || ''
    });
  } catch (error) {
    next(error);
  }
}

async function store(req, res, next) {
  try {
    await Owner.create(req.body.owner_name.trim());
    res.redirect('/owners');
  } catch (error) {
    next(error);
  }
}

async function editForm(req, res, next) {
  try {
    const owner = await Owner.findById(req.params.id);
    if (!owner) return res.status(404).render('error', { title: 'Not Found', message: 'Owner not found.' });
    res.render('owners/edit', { title: 'Edit Owner', owner });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    await Owner.update(req.params.id, req.body.owner_name.trim());
    res.redirect('/owners');
  } catch (error) {
    next(error);
  }
}

async function destroy(req, res, next) {
  try {
    await Owner.remove(req.params.id);
    res.redirect('/owners');
  } catch (error) {
    const message = error.code === 'ER_ROW_IS_REFERENCED_2'
      ? 'Owner cannot be deleted because it already has entries or related records.'
      : 'Unable to delete owner.';
    res.redirect(`/owners?error=${encodeURIComponent(message)}`);
  }
}

async function storeNoFight(req, res, next) {
  try {
    await Owner.createNoFight(req.body.owner_a_id, req.body.owner_b_id);
    res.redirect('/owners');
  } catch (error) {
    res.redirect(`/owners?error=${encodeURIComponent(error.message || 'Unable to save no-fight restriction.')}`);
  }
}

async function destroyNoFight(req, res, next) {
  try {
    await Owner.removeNoFight(req.params.id);
    res.redirect('/owners');
  } catch (error) {
    next(error);
  }
}

module.exports = { index, store, editForm, update, destroy, storeNoFight, destroyNoFight };
