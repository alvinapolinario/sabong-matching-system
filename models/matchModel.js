const db = require('../db');
const bridge = require('../services/bettingBridge');
const { decorateMatchRow, decorateMatchRows } = require('../services/matchDisplayService');

const matchSelect = `
  SELECT
    m.*,
    ev.event_name,
    ev.give_take_grams,
    mc.type AS meron_type,
    mc.wingband AS meron_wingband,
    mc.legband AS meron_legband,
    me.entry_name AS meron_entry,
    mo.owner_name AS meron_owner,
    wc.type AS wala_type,
    wc.wingband AS wala_wingband,
    wc.legband AS wala_legband,
    we.entry_name AS wala_entry,
    wo.owner_name AS wala_owner
  FROM matches m
  JOIN events ev ON ev.event_id = m.event_id
  JOIN entry_data mc ON mc.chicken_id = m.meron_chicken_id
  JOIN entries me ON me.entry_id = mc.entry_id
  JOIN owners mo ON mo.owner_id = me.owner_id
  JOIN entry_data wc ON wc.chicken_id = m.wala_chicken_id
  JOIN entries we ON we.entry_id = wc.entry_id
  JOIN owners wo ON wo.owner_id = we.owner_id
`;

async function all(eventId) {
  const params = [];
  let where = '';
  if (eventId) {
    where = 'WHERE m.event_id = ?';
    params.push(eventId);
  }

  const [rows] = await db.execute(
    `${matchSelect}
     ${where}
     ORDER BY m.event_id DESC, m.fight_no ASC`,
    params
  );
  return decorateMatchRows(rows);
}

async function findById(matchId) {
  const [rows] = await db.execute(
    `${matchSelect}
     WHERE m.match_id = ?`,
    [matchId]
  );
  return decorateMatchRow(rows[0]);
}

async function nextFightNo(eventId, connection = db) {
  const [rows] = await connection.execute(
    'SELECT COALESCE(MAX(fight_no), 0) + 1 AS next_no FROM matches WHERE event_id = ? FOR UPDATE',
    [eventId]
  );
  return rows[0].next_no;
}

async function create(data, connection = db) {
  const [result] = await connection.execute(
    `INSERT INTO matches (
      event_id, fight_no, meron_chicken_id, wala_chicken_id,
      meron_weight, wala_weight, weight_difference, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.event_id,
      data.fight_no,
      data.meron_chicken_id,
      data.wala_chicken_id,
      data.meron_weight,
      data.wala_weight,
      data.weight_difference,
      data.status || 'confirmed'
    ]
  );
  return result.insertId;
}

async function updateStatus(matchId, status) {
  if (bridge.enabled()) {
    await require('../services/fightBridgeService').assertEditable(matchId, 'changed');
    if (status === 'done') {
      const error = new Error('A fight becomes done when the betting station declares its result.');
      error.status = 422;
      throw error;
    }
  }
  const [rows] = await db.execute('SELECT event_id FROM matches WHERE match_id = ?', [matchId]);
  const match = rows[0];
  if (!match) {
    const error = new Error('Match not found.');
    error.status = 404;
    throw error;
  }

  await db.execute('UPDATE matches SET status = ? WHERE match_id = ?', [status, matchId]);
  return match;
}

// Link off only; with the link on, "Active" means CALL (services/fightBridgeService.call).
async function setActiveFight(matchId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT event_id, meron_chicken_id FROM matches WHERE match_id = ? FOR UPDATE',
      [matchId]
    );
    const match = rows[0];
    if (!match) {
      const error = new Error('Match not found.');
      error.status = 404;
      throw error;
    }

    await connection.execute('UPDATE matches SET active_tv = 0 WHERE event_id = ?', [match.event_id]);
    await connection.execute(
      `UPDATE matches
       SET active_tv = 1,
           tv_meron_chicken_id = COALESCE(tv_meron_chicken_id, meron_chicken_id)
       WHERE match_id = ?`,
      [matchId]
    );
    await connection.commit();
    return match;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function setTvMeron(matchId, chickenId) {
  const [rows] = await db.execute(
    `SELECT event_id, fight_no, meron_chicken_id, wala_chicken_id, bet_state
     FROM matches
     WHERE match_id = ?`,
    [matchId]
  );
  const match = rows[0];
  if (!match) {
    const error = new Error('Match not found.');
    error.status = 404;
    throw error;
  }

  if (bridge.enabled() && !['none', 'called', 'held'].includes(match.bet_state)) {
    const error = new Error(`Fight #${match.fight_no}: betting already opened, the Meron side can no longer change.`);
    error.status = 422;
    throw error;
  }

  if (![Number(match.meron_chicken_id), Number(match.wala_chicken_id)].includes(Number(chickenId))) {
    const error = new Error('Selected side does not belong to this match.');
    error.status = 422;
    throw error;
  }

  await db.execute(
    'UPDATE matches SET tv_meron_chicken_id = ?, active_tv = 1 WHERE match_id = ?',
    [chickenId, matchId]
  );
  await db.execute('UPDATE matches SET active_tv = 0 WHERE event_id = ? AND match_id <> ?', [match.event_id, matchId]);
  return match;
}

function scoresForResult(result) {
  if (result === 'meron') return { meronScore: 1, walaScore: 0, status: 'done' };
  if (result === 'wala') return { meronScore: 0, walaScore: 1, status: 'done' };
  if (result === 'draw') return { meronScore: 0.5, walaScore: 0.5, status: 'done' };
  return { meronScore: null, walaScore: null, status: 'confirmed' };
}

async function updateResult(matchId, result) {
  if (bridge.enabled()) {
    const error = new Error('Results come from the betting station while the link is on.');
    error.status = 422;
    throw error;
  }
  const normalizedResult = ['meron', 'wala', 'draw'].includes(result) ? result : 'pending';
  const scores = scoresForResult(normalizedResult);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT event_id, meron_chicken_id, wala_chicken_id FROM matches WHERE match_id = ? FOR UPDATE',
      [matchId]
    );
    const match = rows[0];
    if (!match) {
      const error = new Error('Match not found.');
      error.status = 404;
      throw error;
    }

    await connection.execute(
      `UPDATE matches
       SET result = ?, meron_score = ?, wala_score = ?, status = ?
       WHERE match_id = ?`,
      [normalizedResult, scores.meronScore, scores.walaScore, scores.status, matchId]
    );

    const gamecockStatus = normalizedResult === 'pending' ? 'matched' : 'fought';
    await connection.execute(
      'UPDATE entry_data SET status = ? WHERE chicken_id IN (?, ?)',
      [gamecockStatus, match.meron_chicken_id, match.wala_chicken_id]
    );

    await connection.commit();
    return match;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function scoreSummary(eventId) {
  if (!eventId) return [];

  const [rows] = await db.execute(
    `SELECT
       scored.owner_id,
       scored.owner_name,
       scored.entry_id,
       scored.entry_name,
       SUM(COALESCE(scored.score, 0)) AS total_score,
       SUM(CASE WHEN scored.score IS NOT NULL THEN 1 ELSE 0 END) AS result_count,
       GROUP_CONCAT(
         CONCAT(
           '[',
           CASE
             WHEN scored.score = 1 THEN '1'
             WHEN scored.score = 0 THEN '0'
             WHEN scored.score = 0.5 THEN '.5'
             ELSE ' '
           END,
           ']'
         )
         ORDER BY scored.entry_no ASC
         SEPARATOR ''
       ) AS score_breakdown
     FROM (
       SELECT
         mo.owner_id,
         mo.owner_name,
         me.entry_id,
         me.entry_name,
         mc.entry_no,
         m.meron_score AS score
       FROM matches m
       JOIN entry_data mc ON mc.chicken_id = m.meron_chicken_id
       JOIN entries me ON me.entry_id = mc.entry_id
       JOIN owners mo ON mo.owner_id = me.owner_id
       WHERE m.event_id = ? AND m.status <> 'cancelled'
       UNION ALL
       SELECT
         wo.owner_id,
         wo.owner_name,
         we.entry_id,
         we.entry_name,
         wc.entry_no,
         m.wala_score AS score
       FROM matches m
       JOIN entry_data wc ON wc.chicken_id = m.wala_chicken_id
       JOIN entries we ON we.entry_id = wc.entry_id
       JOIN owners wo ON wo.owner_id = we.owner_id
       WHERE m.event_id = ? AND m.status <> 'cancelled'
     ) scored
     GROUP BY scored.owner_id, scored.owner_name, scored.entry_id, scored.entry_name
     ORDER BY total_score DESC, scored.owner_name ASC, scored.entry_name ASC`,
    [eventId, eventId]
  );
  return rows;
}

async function entryScoreCard(eventId, entryId) {
  const [rows] = await db.execute(
    `SELECT
       scored.owner_name,
       scored.entry_name,
       SUM(COALESCE(scored.score, 0)) AS total_score,
       SUM(CASE WHEN scored.score IS NOT NULL THEN 1 ELSE 0 END) AS result_count,
       GROUP_CONCAT(
         CONCAT(
           '[',
           CASE
             WHEN scored.score = 1 THEN '1'
             WHEN scored.score = 0 THEN '0'
             WHEN scored.score = 0.5 THEN '.5'
             ELSE ' '
           END,
           ']'
         )
         ORDER BY scored.entry_no ASC
         SEPARATOR ''
       ) AS score_breakdown
     FROM (
       SELECT
         mo.owner_name,
         me.entry_name,
         mc.entry_no,
         m.meron_score AS score
       FROM matches m
       JOIN entry_data mc ON mc.chicken_id = m.meron_chicken_id
       JOIN entries me ON me.entry_id = mc.entry_id
       JOIN owners mo ON mo.owner_id = me.owner_id
       WHERE m.event_id = ? AND me.entry_id = ? AND m.status <> 'cancelled'
       UNION ALL
       SELECT
         wo.owner_name,
         we.entry_name,
         wc.entry_no,
         m.wala_score AS score
       FROM matches m
       JOIN entry_data wc ON wc.chicken_id = m.wala_chicken_id
       JOIN entries we ON we.entry_id = wc.entry_id
       JOIN owners wo ON wo.owner_id = we.owner_id
       WHERE m.event_id = ? AND we.entry_id = ? AND m.status <> 'cancelled'
     ) scored
     GROUP BY scored.owner_name, scored.entry_name`,
    [eventId, entryId, eventId, entryId]
  );
  return rows[0];
}

async function activeTvCard(side, eventId) {
  const params = [];
  let eventWhere = '';
  if (eventId) {
    eventWhere = 'AND m.event_id = ?';
    params.push(eventId);
  }

  const [rows] = await db.execute(
    `SELECT
       m.match_id,
       m.event_id,
       m.fight_no,
       m.meron_chicken_id,
       m.wala_chicken_id,
       m.meron_weight,
       m.wala_weight,
       COALESCE(m.tv_meron_chicken_id, m.meron_chicken_id) AS tv_meron_chicken_id,
       me.entry_id AS meron_entry_id,
       we.entry_id AS wala_entry_id
     FROM matches m
     JOIN entry_data mc ON mc.chicken_id = m.meron_chicken_id
     JOIN entries me ON me.entry_id = mc.entry_id
     JOIN entry_data wc ON wc.chicken_id = m.wala_chicken_id
     JOIN entries we ON we.entry_id = wc.entry_id
     WHERE m.active_tv = 1 ${eventWhere}
     ORDER BY m.event_id DESC, m.fight_no ASC
     LIMIT 1`,
    params
  );
  const match = rows[0];
  if (!match) return null;

  const tvMeronIsOriginalMeron = Number(match.tv_meron_chicken_id) === Number(match.meron_chicken_id);
  const meronEntryId = tvMeronIsOriginalMeron ? match.meron_entry_id : match.wala_entry_id;
  const walaEntryId = tvMeronIsOriginalMeron ? match.wala_entry_id : match.meron_entry_id;
  const entryId = side === 'wala' ? walaEntryId : meronEntryId;
  const meronWeight = tvMeronIsOriginalMeron ? match.meron_weight : match.wala_weight;
  const walaWeight = tvMeronIsOriginalMeron ? match.wala_weight : match.meron_weight;
  const weight = side === 'wala' ? walaWeight : meronWeight;
  const card = await entryScoreCard(match.event_id, entryId);

  return { match, card, weight };
}

async function renumberEvent(eventId, connection) {
  // Once fights are called or played, numbers are shared with the betting station: leave gaps instead.
  if (await require('../services/fightBridgeService').hasLockedNumbers(eventId, connection)) return;
  const [rows] = await connection.execute(
    'SELECT match_id, fight_no FROM matches WHERE event_id = ? ORDER BY fight_no ASC FOR UPDATE',
    [eventId]
  );
  if (!rows.length) return;

  const maxFightNo = rows.reduce((max, row) => Math.max(max, Number(row.fight_no)), 0);
  const offset = maxFightNo + rows.length + 1000;
  await connection.execute(
    'UPDATE matches SET fight_no = fight_no + ? WHERE event_id = ?',
    [offset, eventId]
  );

  for (let index = 0; index < rows.length; index += 1) {
    await connection.execute(
      'UPDATE matches SET fight_no = ? WHERE event_id = ? AND match_id = ?',
      [index + 1, eventId, rows[index].match_id]
    );
  }
}

async function deleteAndRelease(matchId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT * FROM matches WHERE match_id = ? FOR UPDATE',
      [matchId]
    );
    const match = rows[0];
    if (!match) {
      const error = new Error('Match not found.');
      error.status = 404;
      throw error;
    }

    if (!['pending', 'confirmed'].includes(match.status)) {
      const error = new Error('Only pending or confirmed matches can be changed.');
      error.status = 422;
      throw error;
    }
    if (match.bet_state && match.bet_state !== 'none') {
      const error = new Error(`Fight #${match.fight_no} is ${match.bet_state} on the betting station. Recall it first (before betting opens).`);
      error.status = 422;
      throw error;
    }

    await connection.execute('DELETE FROM matches WHERE match_id = ?', [matchId]);
    await connection.execute(
      `UPDATE entry_data
       SET status = 'available'
       WHERE chicken_id IN (?, ?)
         AND status = 'matched'`,
      [match.meron_chicken_id, match.wala_chicken_id]
    );
    await renumberEvent(match.event_id, connection);
    await connection.commit();
    return match;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteUnfoughtAndRelease(eventId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [matches] = await connection.execute(
      `SELECT match_id, meron_chicken_id, wala_chicken_id
       FROM matches
       WHERE event_id = ?
         AND status IN ('pending', 'confirmed')
         AND result = 'pending'
         AND bet_state = 'none'
       FOR UPDATE`,
      [eventId]
    );

    if (!matches.length) {
      await connection.rollback();
      return { event_id: eventId, deleted_count: 0 };
    }

    const matchIds = matches.map((match) => match.match_id);
    const chickenIds = matches.flatMap((match) => [match.meron_chicken_id, match.wala_chicken_id]);
    const matchPlaceholders = matchIds.map(() => '?').join(',');
    const chickenPlaceholders = chickenIds.map(() => '?').join(',');

    await connection.execute(
      `DELETE FROM matches WHERE match_id IN (${matchPlaceholders})`,
      matchIds
    );
    await connection.execute(
      `UPDATE entry_data
       SET status = 'available'
       WHERE chicken_id IN (${chickenPlaceholders})
         AND status = 'matched'`,
      chickenIds
    );
    await renumberEvent(eventId, connection);
    await connection.commit();

    return { event_id: eventId, deleted_count: matches.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function reorder(eventId, orderedMatchIds) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.execute(
      'SELECT match_id, fight_no FROM matches WHERE event_id = ? ORDER BY fight_no ASC FOR UPDATE',
      [eventId]
    );
    const existingIds = existingRows.map((row) => Number(row.match_id));
    const submittedIds = orderedMatchIds.map((id) => Number(id));

    const sameLength = existingIds.length === submittedIds.length;
    const sameIds = sameLength && existingIds.every((id) => submittedIds.includes(id));
    if (!sameIds) {
      const error = new Error('Fight order is stale. Reload the page and try again.');
      error.status = 409;
      throw error;
    }

    // Fights already called or played keep their numbers (shared with the betting station).
    if (bridge.enabled()) {
      const [locked] = await connection.execute(
        "SELECT match_id, fight_no FROM matches WHERE event_id = ? AND (bet_state <> 'none' OR result <> 'pending' OR status = 'done')",
        [eventId]
      );
      const moved = locked.filter((row) => submittedIds.indexOf(Number(row.match_id)) + 1 !== Number(row.fight_no));
      if (moved.length) {
        const error = new Error(`Fights already called or played keep their numbers (#${moved.map((r) => r.fight_no).join(', #')}). Move only fights that are not yet called.`);
        error.status = 422;
        throw error;
      }
    }

    const maxFightNo = existingRows.reduce((max, row) => Math.max(max, Number(row.fight_no)), 0);
    const offset = maxFightNo + submittedIds.length + 1000;
    await connection.execute(
      'UPDATE matches SET fight_no = fight_no + ? WHERE event_id = ?',
      [offset, eventId]
    );

    for (let index = 0; index < submittedIds.length; index += 1) {
      await connection.execute(
        'UPDATE matches SET fight_no = ? WHERE event_id = ? AND match_id = ?',
        [index + 1, eventId, submittedIds[index]]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function dashboardStats() {
  const [rows] = await db.execute(
    `SELECT
      (SELECT COUNT(*) FROM events) AS events,
      (SELECT COUNT(*) FROM owners) AS owners,
      (SELECT COUNT(*) FROM entries) AS entries,
      (SELECT COUNT(*) FROM entry_data WHERE status = 'available') AS available,
      (SELECT COUNT(*) FROM matches WHERE status IN ('pending','confirmed')) AS active_matches`
  );
  return rows[0];
}

module.exports = {
  all,
  findById,
  nextFightNo,
  create,
  updateStatus,
  setActiveFight,
  setTvMeron,
  updateResult,
  scoreSummary,
  activeTvCard,
  deleteAndRelease,
  deleteUnfoughtAndRelease,
  reorder,
  dashboardStats
};
