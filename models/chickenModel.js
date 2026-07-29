const db = require('../db');

async function all(filters = {}) {
  const where = [];
  const params = [];

  if (filters.event_id) {
    where.push('e.event_id = ?');
    params.push(filters.event_id);
  }
  if (filters.status) {
    where.push('ed.status = ?');
    params.push(filters.status);
  }
  if (filters.type) {
    where.push('ed.type = ?');
    params.push(filters.type);
  }
  if (filters.search) {
    where.push('(o.owner_name LIKE ? OR e.entry_name LIKE ? OR ed.wingband LIKE ? OR ed.legband LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term, term);
  }
  if (filters.min_weight) {
    where.push('ed.weight >= ?');
    params.push(Number(filters.min_weight));
  }
  if (filters.max_weight) {
    where.push('ed.weight <= ?');
    params.push(Number(filters.max_weight));
  }

  const [rows] = await db.execute(
    `SELECT ed.*, e.entry_name, e.event_id, o.owner_id, o.owner_name, ev.event_name
     FROM entry_data ed
     JOIN entries e ON e.entry_id = ed.entry_id
     JOIN owners o ON o.owner_id = e.owner_id
     JOIN events ev ON ev.event_id = e.event_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ed.weight ASC, ed.created_at ASC`,
    params
  );
  return rows;
}

async function findDetailed(chickenId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT
       ed.*,
       e.entry_name,
       e.event_id,
       o.owner_id,
       o.owner_name,
       ev.event_name,
       ev.cock_min_weight,
       ev.cock_max_weight,
       ev.stag_min_weight,
       ev.stag_max_weight,
       ev.bullstag_min_weight,
       ev.bullstag_max_weight,
       ev.allow_cock,
       ev.allow_stag,
       ev.allow_bullstag
     FROM entry_data ed
     JOIN entries e ON e.entry_id = ed.entry_id
     JOIN owners o ON o.owner_id = e.owner_id
     JOIN events ev ON ev.event_id = e.event_id
     WHERE ed.chicken_id = ?`,
    [chickenId]
  );
  return rows[0];
}

async function updateStatus(chickenIds, status, connection = db) {
  if (!chickenIds.length) return;
  const placeholders = chickenIds.map(() => '?').join(',');
  await connection.execute(
    `UPDATE entry_data SET status = ? WHERE chicken_id IN (${placeholders})`,
    [status, ...chickenIds]
  );
}

async function update(chickenId, data) {
  await db.execute(
    `UPDATE entry_data SET
      entry_no = ?, type = ?, weight = ?, wingband = ?, legband = ?
     WHERE chicken_id = ?`,
    [data.entry_no, data.type, data.weight, data.wingband, data.legband, chickenId]
  );
}

module.exports = { all, findDetailed, updateStatus, update };
