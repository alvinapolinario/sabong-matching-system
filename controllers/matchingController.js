const db = require('../db');
const config = require('../config');
const Event = require('../models/eventModel');
const Chicken = require('../models/chickenModel');
const Match = require('../models/matchModel');
const Owner = require('../models/ownerModel');
const Matching = require('../services/matchingService');

const {
  AUTO_MATCH_ENTRY_GAP,
  validateChicken,
  recommendedOpponents,
  findAutoPairs,
  summarizeAutoMatch,
  buildAutoMatchMessage
} = Matching;

async function board(req, res, next) {
  try {
    const events = await Event.all();
    const selectedEvent = req.query.event_id || events[0]?.event_id || '';
    const availableFilters = req.query.recommend_for
      ? { event_id: selectedEvent, status: 'available' }
      : { ...req.query, event_id: selectedEvent, status: 'available' };
    const [event, rawAvailable, matches] = await Promise.all([
      selectedEvent ? Event.findById(selectedEvent) : null,
      selectedEvent ? Chicken.all(availableFilters) : [],
      selectedEvent ? Match.all(selectedEvent) : []
    ]);
    let available = rawAvailable;

    if (event && req.query.recommend_for) {
      const baseChicken = await Chicken.findDetailed(req.query.recommend_for);
      const noFightSet = await Owner.noFightSet();
      available = recommendedOpponents(rawAvailable, baseChicken, event, noFightSet);
    }

    res.render('matching/board', {
      title: 'Matching Board',
      events,
      event,
      selectedEvent,
      available,
      matches,
      filters: req.query,
      autoMatchEntryGap: AUTO_MATCH_ENTRY_GAP
    });
  } catch (error) {
    next(error);
  }
}

async function autoMatch(req, res, next) {
  const connection = await db.getConnection();
  try {
    const eventId = Number(req.body.event_id);
    if (!eventId) {
      return res.status(422).json({ ok: false, message: 'Select an event before auto matching.' });
    }

    await connection.beginTransaction();

    const [eventRows] = await connection.execute('SELECT * FROM events WHERE event_id = ? FOR UPDATE', [eventId]);
    const event = eventRows[0];
    if (!event) {
      await connection.rollback();
      return res.status(404).json({ ok: false, message: 'Event not found.' });
    }

    const [chickens] = await connection.execute(
      `SELECT ed.*, e.entry_name, e.event_id, o.owner_id, o.owner_name
       FROM entry_data ed
       JOIN entries e ON e.entry_id = ed.entry_id
       JOIN owners o ON o.owner_id = e.owner_id
       WHERE e.event_id = ?
         AND ed.status = 'available'
       ORDER BY ed.type ASC, ed.weight ASC, ed.chicken_id ASC
       FOR UPDATE`,
      [eventId]
    );

    const [existingFightEntries] = await connection.execute(
      `SELECT
         meron_entry.entry_id AS meron_entry_id,
         wala_entry.entry_id AS wala_entry_id
       FROM matches m
       JOIN entry_data meron_gamecock ON meron_gamecock.chicken_id = m.meron_chicken_id
       JOIN entries meron_entry ON meron_entry.entry_id = meron_gamecock.entry_id
       JOIN entry_data wala_gamecock ON wala_gamecock.chicken_id = m.wala_chicken_id
       JOIN entries wala_entry ON wala_entry.entry_id = wala_gamecock.entry_id
       WHERE m.event_id = ?
       ORDER BY m.fight_no ASC
       FOR UPDATE`,
      [eventId]
    );
    const recentFightEntries = existingFightEntries
      .slice(-AUTO_MATCH_ENTRY_GAP)
      .map((fight) => [Number(fight.meron_entry_id), Number(fight.wala_entry_id)]);

    const noFightSet = await Owner.noFightSet();
    const pairs = findAutoPairs(chickens, event, recentFightEntries, AUTO_MATCH_ENTRY_GAP, noFightSet);
    const summary = summarizeAutoMatch(chickens, pairs, event);

    if (!pairs.length) {
      await connection.rollback();
      return res.status(422).json({
        ok: false,
        message: buildAutoMatchMessage(summary),
        matched_count: 0,
        unmatched_count: summary.unmatched_count
      });
    }

    const matchedIds = [];
    for (const pair of pairs) {
      const fightNo = await Match.nextFightNo(eventId, connection);
      await Match.create({
        event_id: eventId,
        fight_no: fightNo,
        meron_chicken_id: pair.meron.chicken_id,
        wala_chicken_id: pair.wala.chicken_id,
        meron_weight: pair.meron.weight,
        wala_weight: pair.wala.weight,
        weight_difference: pair.difference,
        status: 'confirmed'
      }, connection);
      matchedIds.push(pair.meron.chicken_id, pair.wala.chicken_id);
    }

    await Chicken.updateStatus(matchedIds, 'matched', connection);
    await connection.commit();

    req.io.to(`event:${eventId}`).emit('match:created', { event_id: eventId });
    req.io.emit('pool:updated', { event_id: eventId });

    res.json({
      ok: true,
      message: buildAutoMatchMessage(summary),
      matched_count: summary.matched_count,
      unmatched_count: summary.unmatched_count
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
}

async function apiPool(req, res, next) {
  try {
    if (!req.query.recommend_for) {
      const chickens = await Chicken.all({ ...req.query, status: 'available' });
      return res.json({ ok: true, chickens, recommended: false });
    }

    const [event, baseChicken] = await Promise.all([
      Event.findById(req.query.event_id),
      Chicken.findDetailed(req.query.recommend_for)
    ]);

    if (!event || !baseChicken) {
      return res.status(404).json({ ok: false, message: 'Selected Gamecock or event not found.' });
    }

    const baseError = validateChicken(baseChicken, event);
    if (baseError) {
      return res.status(422).json({ ok: false, message: baseError });
    }

    const [chickens, noFightSet] = await Promise.all([
      Chicken.all({ event_id: event.event_id, status: 'available' }),
      Owner.noFightSet()
    ]);
    res.json({
      ok: true,
      chickens: recommendedOpponents(chickens, baseChicken, event, noFightSet),
      recommended: true,
      base_chicken: baseChicken
    });
  } catch (error) {
    next(error);
  }
}

async function apiMatches(req, res, next) {
  try {
    res.json({ ok: true, matches: await Match.all(req.query.event_id) });
  } catch (error) {
    next(error);
  }
}

async function confirm(req, res, next) {
  const connection = await db.getConnection();
  try {
    const eventId = Number(req.body.event_id);
    const meronId = Number(req.body.meron_chicken_id);
    const walaId = Number(req.body.wala_chicken_id);

    if (!eventId || !meronId || !walaId) {
      return res.status(422).json({ ok: false, message: 'Select one LEFT SIDE and one RIGHT SIDE Gamecock.' });
    }
    if (meronId === walaId) {
      return res.status(422).json({ ok: false, message: 'A Gamecock cannot fight itself.' });
    }

    await connection.beginTransaction();

    const [eventRows] = await connection.execute('SELECT * FROM events WHERE event_id = ? FOR UPDATE', [eventId]);
    const event = eventRows[0];
    if (!event) {
      await connection.rollback();
      return res.status(404).json({ ok: false, message: 'Event not found.' });
    }

    const [chickenRows] = await connection.execute(
      `SELECT ed.*, e.entry_name, e.event_id, o.owner_id, o.owner_name
       FROM entry_data ed
       JOIN entries e ON e.entry_id = ed.entry_id
       JOIN owners o ON o.owner_id = e.owner_id
       WHERE ed.chicken_id IN (?, ?)
       FOR UPDATE`,
      [meronId, walaId]
    );

    const meron = chickenRows.find((row) => Number(row.chicken_id) === meronId);
    const wala = chickenRows.find((row) => Number(row.chicken_id) === walaId);

    const meronError = validateChicken(meron, event);
    const walaError = validateChicken(wala, event);
    if (meronError || walaError) {
      await connection.rollback();
      return res.status(422).json({ ok: false, message: meronError || walaError });
    }

    if (Number(meron.owner_id) === Number(wala.owner_id)) {
      await connection.rollback();
      return res.status(422).json({ ok: false, message: 'Same owner cannot be matched.' });
    }

    if (await Owner.hasNoFight(meron.owner_id, wala.owner_id, connection)) {
      await connection.rollback();
      return res.status(422).json({ ok: false, message: 'These owners are marked as No Fight With each other.' });
    }

    const difference = Math.abs(Number(meron.weight) - Number(wala.weight));
    if (difference > Number(event.give_take_grams)) {
      const overridePasscode = String(req.body.override_passcode || '').trim();
      if (overridePasscode !== config.manualWeightOverridePasscode) {
        await connection.rollback();
        return res.status(403).json({
          ok: false,
          message: `Weight difference is ${difference}g. Limit is ${event.give_take_grams}g. Override passcode is required.`
        });
      }

      console.info(
        `Manual weight override approved: event=${eventId}, left=${meronId}:${meron.weight}g, right=${walaId}:${wala.weight}g, difference=${difference}g`
      );
    }

    if (meron.type !== wala.type) {
      const overridePasscode = String(req.body.override_passcode || '').trim();
      if (overridePasscode !== config.manualMixedTypePasscode) {
        await connection.rollback();
        return res.status(403).json({
          ok: false,
          message: 'Mixed type manual match requires the confirmation passcode.'
        });
      }

      console.info(
        `Manual mixed type match approved: event=${eventId}, left=${meronId}:${meron.type}, right=${walaId}:${wala.type}`
      );
    }

    const fightNo = await Match.nextFightNo(eventId, connection);
    const matchId = await Match.create({
      event_id: eventId,
      fight_no: fightNo,
      meron_chicken_id: meronId,
      wala_chicken_id: walaId,
      meron_weight: meron.weight,
      wala_weight: wala.weight,
      weight_difference: difference,
      status: 'confirmed'
    }, connection);

    await Chicken.updateStatus([meronId, walaId], 'matched', connection);
    await connection.commit();

    const match = await Match.findById(matchId);
    req.io.to(`event:${eventId}`).emit('match:created', { event_id: eventId, match });
    req.io.emit('pool:updated', { event_id: eventId });

    res.json({ ok: true, message: `Fight #${fightNo} confirmed.`, match });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
}

async function destroy(req, res, next) {
  try {
    const match = await Match.deleteAndRelease(req.params.id);
    req.io.to(`event:${match.event_id}`).emit('match:deleted', { event_id: match.event_id });
    req.io.emit('pool:updated', { event_id: match.event_id });
    res.json({ ok: true, message: 'Match removed. Gamecocks are available again.' });
  } catch (error) {
    res.status(error.status || 500).json({
      ok: false,
      message: error.message || 'Unable to remove match.'
    });
  }
}

async function destroyUnfought(req, res, next) {
  try {
    const eventId = Number(req.body.event_id);
    if (!eventId) {
      return res.status(422).json({ ok: false, message: 'Select an event first.' });
    }

    const result = await Match.deleteUnfoughtAndRelease(eventId);
    req.io.to(`event:${eventId}`).emit('match:deleted', { event_id: eventId });
    req.io.emit('pool:updated', { event_id: eventId });

    res.json({
      ok: true,
      message: result.deleted_count
        ? `Removed ${result.deleted_count} unfought match${result.deleted_count === 1 ? '' : 'es'}.`
        : 'No unfought matches to remove.',
      deleted_count: result.deleted_count
    });
  } catch (error) {
    res.status(error.status || 500).json({
      ok: false,
      message: error.message || 'Unable to remove unfought matches.'
    });
  }
}

module.exports = { board, autoMatch, apiPool, apiMatches, confirm, destroy, destroyUnfought };
