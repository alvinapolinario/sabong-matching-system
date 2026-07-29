const db = require('../db');

async function all() {
  const [rows] = await db.execute('SELECT * FROM events ORDER BY event_date DESC, event_id DESC');
  return rows;
}

async function findById(eventId) {
  const [rows] = await db.execute('SELECT * FROM events WHERE event_id = ?', [eventId]);
  return rows[0];
}

async function create(data) {
  const [result] = await db.execute(
    `INSERT INTO events (
      event_name, event_date, venue, give_take_grams,
      cock_min_weight, cock_max_weight, stag_min_weight, stag_max_weight,
      bullstag_min_weight, bullstag_max_weight,
      allow_cock, allow_stag, allow_bullstag, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.event_name,
      data.event_date,
      data.venue,
      data.give_take_grams,
      data.cock_min_weight,
      data.cock_max_weight,
      data.stag_min_weight,
      data.stag_max_weight,
      data.bullstag_min_weight,
      data.bullstag_max_weight,
      data.allow_cock,
      data.allow_stag,
      data.allow_bullstag,
      data.status
    ]
  );
  return result.insertId;
}

async function update(eventId, data) {
  await db.execute(
    `UPDATE events SET
      event_name = ?, event_date = ?, venue = ?, give_take_grams = ?,
      cock_min_weight = ?, cock_max_weight = ?, stag_min_weight = ?, stag_max_weight = ?,
      bullstag_min_weight = ?, bullstag_max_weight = ?,
      allow_cock = ?, allow_stag = ?, allow_bullstag = ?, status = ?
    WHERE event_id = ?`,
    [
      data.event_name,
      data.event_date,
      data.venue,
      data.give_take_grams,
      data.cock_min_weight,
      data.cock_max_weight,
      data.stag_min_weight,
      data.stag_max_weight,
      data.bullstag_min_weight,
      data.bullstag_max_weight,
      data.allow_cock,
      data.allow_stag,
      data.allow_bullstag,
      data.status,
      eventId
    ]
  );
}

async function remove(eventId) {
  await db.execute('DELETE FROM events WHERE event_id = ?', [eventId]);
}

module.exports = { all, findById, create, update, remove };
