const db = require('../db');

async function all() {
  const [rows] = await db.execute('SELECT * FROM owners ORDER BY owner_name ASC');
  return rows;
}

async function findById(ownerId) {
  const [rows] = await db.execute('SELECT * FROM owners WHERE owner_id = ?', [ownerId]);
  return rows[0];
}

async function create(ownerName) {
  const [result] = await db.execute('INSERT INTO owners (owner_name) VALUES (?)', [ownerName]);
  return result.insertId;
}

async function update(ownerId, ownerName) {
  await db.execute('UPDATE owners SET owner_name = ? WHERE owner_id = ?', [ownerName, ownerId]);
}

async function remove(ownerId) {
  await db.execute('DELETE FROM owners WHERE owner_id = ?', [ownerId]);
}

function normalizePair(ownerAId, ownerBId) {
  const first = Number(ownerAId);
  const second = Number(ownerBId);
  return first < second ? [first, second] : [second, first];
}

async function noFightPairs() {
  const [rows] = await db.execute(
    `SELECT
       nf.no_fight_id,
       nf.owner_a_id,
       a.owner_name AS owner_a_name,
       nf.owner_b_id,
       b.owner_name AS owner_b_name,
       nf.created_at
     FROM owner_no_fights nf
     JOIN owners a ON a.owner_id = nf.owner_a_id
     JOIN owners b ON b.owner_id = nf.owner_b_id
     ORDER BY a.owner_name ASC, b.owner_name ASC`
  );
  return rows;
}

async function createNoFight(ownerAId, ownerBId) {
  const [ownerA, ownerB] = normalizePair(ownerAId, ownerBId);
  if (!ownerA || !ownerB || ownerA === ownerB) {
    const error = new Error('Select two different owners.');
    error.status = 422;
    throw error;
  }

  await db.execute(
    'INSERT IGNORE INTO owner_no_fights (owner_a_id, owner_b_id) VALUES (?, ?)',
    [ownerA, ownerB]
  );
}

async function removeNoFight(noFightId) {
  await db.execute('DELETE FROM owner_no_fights WHERE no_fight_id = ?', [noFightId]);
}

async function noFightSet() {
  const pairs = await noFightPairs();
  return new Set(pairs.map((pair) => `${pair.owner_a_id}:${pair.owner_b_id}`));
}

async function hasNoFight(ownerAId, ownerBId, connection = db) {
  const [ownerA, ownerB] = normalizePair(ownerAId, ownerBId);
  const [rows] = await connection.execute(
    'SELECT no_fight_id FROM owner_no_fights WHERE owner_a_id = ? AND owner_b_id = ? LIMIT 1',
    [ownerA, ownerB]
  );
  return Boolean(rows[0]);
}

module.exports = {
  all,
  findById,
  create,
  update,
  remove,
  normalizePair,
  noFightPairs,
  createNoFight,
  removeNoFight,
  noFightSet,
  hasNoFight
};
