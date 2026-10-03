// Fight flow with the betting station (same server).
//
//   none ──call──► called ──(betting opens)──► open ──► closed ──(result)──► finished
//                   │  ▲                                                        │
//          recall ◄─┘  └── re-send (after a HOLD from betting)          correction (version 2+)
//   Cancelled by betting → cancelled (no points; both cocks can be matched again).
//
// Matching decides which fight is next (any order). Betting opens/closes and
// declares the result; matching then records it and the derby points
// (win 1, draw ½ each, loss 0). Once betting opens, matching can no longer
// change, re-pair, renumber or recall that fight.
const db = require('../db');
const bridge = require('./bettingBridge');

const IN_PLAY = ['called', 'open', 'closed', 'held'];

function fail(message, status = 422) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function withTransaction(work) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function lockMatch(connection, matchId) {
  const [rows] = await connection.execute('SELECT * FROM matches WHERE match_id = ? FOR UPDATE', [matchId]);
  if (!rows[0]) throw fail('Fight not found.', 404);
  return rows[0];
}

/** Details of one side as sent to the betting station. */
async function sideDetails(connection, chickenId, weight) {
  const [rows] = await connection.execute(
    `SELECT ed.type, ed.wingband, ed.legband, e.entry_name, o.owner_name
     FROM entry_data ed JOIN entries e ON e.entry_id = ed.entry_id JOIN owners o ON o.owner_id = e.owner_id
     WHERE ed.chicken_id = ?`,
    [chickenId]
  );
  const r = rows[0] || {};
  return { entry: r.entry_name || '', owner: r.owner_name || '', weight, wingband: r.wingband || '', legband: r.legband || '', type: r.type || '' };
}

async function callPayload(connection, match) {
  const [events] = await connection.execute('SELECT event_id, event_name, event_date FROM events WHERE event_id = ?', [match.event_id]);
  const ev = events[0];
  const meronId = Number(match.called_meron_chicken_id);
  const meronIsOriginal = meronId === Number(match.meron_chicken_id);
  const walaId = meronIsOriginal ? Number(match.wala_chicken_id) : Number(match.meron_chicken_id);
  return {
    event: { id: ev.event_id, name: ev.event_name, date: ev.event_date },
    fight: {
      uid: match.match_id,
      no: match.fight_no,
      version: match.call_version,
      meron: await sideDetails(connection, meronId, meronIsOriginal ? match.meron_weight : match.wala_weight),
      wala: await sideDetails(connection, walaId, meronIsOriginal ? match.wala_weight : match.meron_weight)
    }
  };
}

/** CALL: this fight is next. Only one fight in play per event. */
async function call(matchId) {
  return withTransaction(async (connection) => {
    const match = await lockMatch(connection, matchId);
    if (match.status === 'cancelled') throw fail(`Fight #${match.fight_no} is cancelled.`);
    if (match.result !== 'pending' || ['finished', 'cancelled'].includes(match.bet_state)) throw fail(`Fight #${match.fight_no} was already played.`);
    if (IN_PLAY.includes(match.bet_state)) throw fail(`Fight #${match.fight_no} is already called.`);

    const [others] = await connection.execute(
      `SELECT fight_no, bet_state FROM matches WHERE event_id = ? AND match_id <> ? AND bet_state IN ('called','open','closed','held') FOR UPDATE`,
      [match.event_id, matchId]
    );
    if (others.length) throw fail(`Fight #${others[0].fight_no} is still in play (${others[0].bet_state}). Wait for its result, or recall it before betting opens.`);

    await connection.execute('UPDATE matches SET active_tv = 0 WHERE event_id = ?', [match.event_id]);
    await connection.execute(
      `UPDATE matches
       SET active_tv = 1, bet_state = 'called', called_at = NOW(), call_version = call_version + 1, bet_hold_reason = NULL,
           tv_meron_chicken_id = COALESCE(tv_meron_chicken_id, meron_chicken_id),
           called_meron_chicken_id = COALESCE(tv_meron_chicken_id, meron_chicken_id),
           status = IF(status = 'pending', 'confirmed', status)
       WHERE match_id = ?`,
      [matchId]
    );
    const updated = await lockMatch(connection, matchId);
    const outboxId = await bridge.queue(connection, 'call', matchId, await callPayload(connection, updated));
    return { match: updated, outboxId };
  });
}

/** RE-SEND after fixing a HOLD (or after switching which side is Meron). */
async function resend(matchId) {
  return withTransaction(async (connection) => {
    const match = await lockMatch(connection, matchId);
    if (!['called', 'held'].includes(match.bet_state)) throw fail(`Fight #${match.fight_no} can only be re-sent before betting opens.`);
    await connection.execute(
      `UPDATE matches SET bet_state = 'called', bet_hold_reason = NULL, call_version = call_version + 1,
              called_meron_chicken_id = COALESCE(tv_meron_chicken_id, meron_chicken_id)
       WHERE match_id = ?`,
      [matchId]
    );
    const updated = await lockMatch(connection, matchId);
    const outboxId = await bridge.queue(connection, 'call', matchId, await callPayload(connection, updated));
    return { match: updated, outboxId };
  });
}

/** RECALL: withdraw the called fight before betting opens. */
async function recall(matchId, reason) {
  return withTransaction(async (connection) => {
    const match = await lockMatch(connection, matchId);
    if (!['called', 'held'].includes(match.bet_state)) {
      throw fail(match.bet_state === 'none' ? `Fight #${match.fight_no} is not called.` : `Fight #${match.fight_no}: betting already opened. Only the betting operator can cancel it.`);
    }
    await connection.execute(
      "UPDATE matches SET bet_state = 'none', bet_hold_reason = NULL, active_tv = 0, called_at = NULL WHERE match_id = ?",
      [matchId]
    );
    const outboxId = await bridge.queue(connection, 'recall', matchId, { fight_uid: matchId, fight_no: match.fight_no, reason: reason || null });
    return { match, outboxId };
  });
}

/** The betting station refused a call/recall: put the fight back as it was. */
bridge.onRefused = async (row) => {
  const payload = JSON.parse(row.payload);
  if (row.type === 'call') {
    await db.execute(
      "UPDATE matches SET bet_state = 'none', active_tv = 0 WHERE match_id = ? AND bet_state = 'called' AND call_version = ?",
      [payload.fight.uid, payload.fight.version]
    );
  } else if (row.type === 'recall') {
    await db.execute("UPDATE matches SET bet_state = 'called', active_tv = 1 WHERE match_id = ? AND bet_state = 'none'", [payload.fight_uid]);
  }
};

/** Betting status: open / closed / held. */
async function applyStatus(m) {
  const matchId = Number(m.fight_uid);
  const state = String(m.state || '');
  if (!['open', 'closed', 'held'].includes(state)) throw fail('Unknown betting state.', 422);
  return withTransaction(async (connection) => {
    const match = await lockMatch(connection, matchId);
    if (['finished', 'cancelled'].includes(match.bet_state)) return { match, message: 'Fight already finished; status ignored.' };
    if (state === 'held' && match.bet_state !== 'called') return { match, message: 'Hold ignored (fight not in the called state).' };
    await connection.execute(
      `UPDATE matches SET bet_state = ?, bet_hold_reason = ?, bet_meron_odds = ?, bet_wala_odds = ? WHERE match_id = ?`,
      [state, state === 'held' ? String(m.hold_reason || 'On hold').slice(0, 255) : null,
        Number(m.meron_odds) > 0 ? Number(m.meron_odds) : null, Number(m.wala_odds) > 0 ? Number(m.wala_odds) : null, matchId]
    );
    return { match, message: `Fight #${match.fight_no}: betting ${state}.` };
  });
}

function scores(result) {
  if (result === 'meron') return [1, 0];
  if (result === 'wala') return [0, 1];
  if (result === 'draw') return [0.5, 0.5];
  return [null, null];
}

/** Result from betting (version 1) or a correction (version 2+). Betting sides are mapped to the called cocks. */
async function applyResult(m) {
  const matchId = Number(m.fight_uid);
  const version = Number(m.version || 1);
  const bettingResult = String(m.result || '');
  if (!['meron', 'wala', 'draw', 'cancelled'].includes(bettingResult)) throw fail('Unknown result.', 422);

  return withTransaction(async (connection) => {
    const match = await lockMatch(connection, matchId);
    if (version <= Number(match.result_version)) return { match, message: 'Result already recorded.' };

    const meronCalled = Number(match.called_meron_chicken_id || match.meron_chicken_id);
    const chickens = [match.meron_chicken_id, match.wala_chicken_id];
    const wasCancelled = match.status === 'cancelled';
    const correction = version > 1;

    if (bettingResult === 'cancelled') {
      await connection.execute(
        `UPDATE matches SET status = 'cancelled', result = 'pending', meron_score = NULL, wala_score = NULL,
                bet_state = 'cancelled', active_tv = 0, result_version = ?, result_source = 'betting',
                result_corrected_at = IF(?, NOW(), NULL), result_corrected_from = ?
         WHERE match_id = ?`,
        [version, correction ? 1 : 0, correction ? String(m.previous || '').slice(0, 60) : null, matchId]
      );
      // No points; both cocks can be matched again.
      await connection.execute("UPDATE entry_data SET status = 'available' WHERE chicken_id IN (?, ?)", chickens);
      return { match, message: `Fight #${match.fight_no} cancelled by the betting station.` };
    }

    if (wasCancelled) {
      const [taken] = await connection.execute("SELECT COUNT(*) AS n FROM entry_data WHERE chicken_id IN (?, ?) AND status <> 'available'", chickens);
      if (Number(taken[0].n) > 0) throw fail(`Fight #${match.fight_no} was cancelled and its cocks were already matched again. Fix this fight manually.`, 409);
    }

    // Betting's "Meron" is the cock that was Meron when the fight was called.
    let result = bettingResult;
    if (bettingResult === 'meron' || bettingResult === 'wala') {
      const winner = bettingResult === 'meron' ? meronCalled : (meronCalled === Number(match.meron_chicken_id) ? Number(match.wala_chicken_id) : Number(match.meron_chicken_id));
      result = winner === Number(match.meron_chicken_id) ? 'meron' : 'wala';
    }
    const [meronScore, walaScore] = scores(result);
    await connection.execute(
      `UPDATE matches SET result = ?, meron_score = ?, wala_score = ?, status = 'done', bet_state = 'finished',
              result_version = ?, result_source = 'betting',
              result_corrected_at = IF(?, NOW(), result_corrected_at), result_corrected_from = IF(?, ?, result_corrected_from)
       WHERE match_id = ?`,
      [result, meronScore, walaScore, version, correction ? 1 : 0, correction ? 1 : 0, String(m.previous || '').slice(0, 60), matchId]
    );
    await connection.execute("UPDATE entry_data SET status = 'fought' WHERE chicken_id IN (?, ?)", chickens);
    return { match, message: `Fight #${match.fight_no}: ${bettingResult}${correction ? ' (corrected)' : ''}.` };
  });
}

/** Optional fight duration (seconds), after the result. */
async function setDuration(matchId, seconds) {
  return withTransaction(async (connection) => {
    const match = await lockMatch(connection, matchId);
    if (match.result === 'pending') throw fail(`Fight #${match.fight_no} has no result yet.`);
    await connection.execute('UPDATE matches SET duration_seconds = ? WHERE match_id = ?', [seconds, matchId]);
    return match;
  });
}

/** Locks used by the rest of matching while the link is on. */
async function assertEditable(matchId, action) {
  if (!bridge.enabled()) return;
  const [rows] = await db.execute('SELECT fight_no, bet_state FROM matches WHERE match_id = ?', [matchId]);
  const row = rows[0];
  if (row && row.bet_state !== 'none') {
    throw fail(`Fight #${row.fight_no} is ${row.bet_state} on the betting station; it cannot be ${action} here.`);
  }
}

/** True when an event has fights that were called or played (their numbers must not change). */
async function hasLockedNumbers(eventId, connection = db) {
  if (!bridge.enabled()) return false;
  const [rows] = await connection.execute(
    "SELECT COUNT(*) AS n FROM matches WHERE event_id = ? AND (bet_state <> 'none' OR result <> 'pending' OR status = 'done')",
    [eventId]
  );
  return Number(rows[0].n) > 0;
}

module.exports = { call, resend, recall, applyStatus, applyResult, setDuration, assertEditable, hasLockedNumbers, IN_PLAY };
