const db = require('../db');

async function create(data, connection = db) {
  const [result] = await connection.execute(
    `INSERT INTO override_logs (
      event_id,
      override_type,
      meron_chicken_id,
      wala_chicken_id,
      meron_owner_name,
      wala_owner_name,
      meron_weight,
      wala_weight,
      weight_difference,
      meron_type,
      wala_type,
      give_take_grams,
      session_id,
      ip_address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.event_id,
      data.override_type,
      data.meron_chicken_id,
      data.wala_chicken_id,
      data.meron_owner_name,
      data.wala_owner_name,
      data.meron_weight,
      data.wala_weight,
      data.weight_difference,
      data.meron_type,
      data.wala_type,
      data.give_take_grams,
      data.session_id || null,
      data.ip_address || null
    ]
  );
  return result.insertId;
}

async function all(filters = {}) {
  const params = [];
  let where = '';

  if (filters.event_id) {
    where = 'WHERE ol.event_id = ?';
    params.push(filters.event_id);
  }

  const [rows] = await db.execute(
    `SELECT
       ol.*,
       ev.event_name
     FROM override_logs ol
     JOIN events ev ON ev.event_id = ol.event_id
     ${where}
     ORDER BY ol.created_at DESC, ol.override_log_id DESC
     LIMIT 500`,
    params
  );
  return rows;
}

module.exports = { create, all };
