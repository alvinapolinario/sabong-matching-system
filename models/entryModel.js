const db = require('../db');

async function all(eventId) {
  const params = [];
  let where = '';
  if (eventId) {
    where = 'WHERE e.event_id = ?';
    params.push(eventId);
  }

  const [rows] = await db.execute(
    `SELECT e.*, o.owner_name, ev.event_name, COUNT(ed.chicken_id) AS chicken_count
     FROM entries e
     JOIN owners o ON o.owner_id = e.owner_id
     JOIN events ev ON ev.event_id = e.event_id
     LEFT JOIN entry_data ed ON ed.entry_id = e.entry_id
     ${where}
     GROUP BY e.entry_id
     ORDER BY e.created_at DESC`,
    params
  );
  return rows;
}

async function findById(entryId) {
  const [rows] = await db.execute(
    `SELECT
       e.*,
       o.owner_name,
       ev.event_name,
       ev.give_take_grams,
       ev.cock_min_weight,
       ev.cock_max_weight,
       ev.stag_min_weight,
       ev.stag_max_weight,
       ev.bullstag_min_weight,
       ev.bullstag_max_weight,
       ev.allow_cock,
       ev.allow_stag,
       ev.allow_bullstag
     FROM entries e
     JOIN owners o ON o.owner_id = e.owner_id
     JOIN events ev ON ev.event_id = e.event_id
     WHERE e.entry_id = ?`,
    [entryId]
  );
  return rows[0];
}

async function create(data) {
  const [result] = await db.execute(
    'INSERT INTO entries (owner_id, entry_name, event_id) VALUES (?, ?, ?)',
    [data.owner_id, data.entry_name, data.event_id]
  );
  return result.insertId;
}

async function update(entryId, data) {
  await db.execute(
    'UPDATE entries SET owner_id = ?, entry_name = ?, event_id = ? WHERE entry_id = ?',
    [data.owner_id, data.entry_name, data.event_id, entryId]
  );
}

async function chickens(entryId) {
  const [rows] = await db.execute(
    'SELECT * FROM entry_data WHERE entry_id = ? ORDER BY entry_no ASC',
    [entryId]
  );
  return rows;
}

async function nextEntryNo(entryId) {
  const [rows] = await db.execute(
    'SELECT COALESCE(MAX(entry_no), 0) + 1 AS next_no FROM entry_data WHERE entry_id = ?',
    [entryId]
  );
  return rows[0].next_no;
}

async function addChicken(data) {
  const [result] = await db.execute(
    `INSERT INTO entry_data (entry_id, entry_no, type, weight, wingband, legband, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.entry_id,
      data.entry_no,
      data.type,
      data.weight,
      data.wingband,
      data.legband,
      data.status || 'available'
    ]
  );
  return result.insertId;
}

module.exports = { all, findById, create, update, chickens, nextEntryNo, addChicken };
