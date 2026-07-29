const test = require('node:test');
const assert = require('node:assert/strict');
const { decorateMatchRow } = require('../services/matchDisplayService');

const baseMatch = {
  match_id: 1,
  fight_no: 5,
  meron_type: 'cock',
  wala_type: 'cock',
  weight_difference: 10,
  give_take_grams: 30
};

test('decorateMatchRow adds no markers for standard matches', () => {
  const match = decorateMatchRow(baseMatch);
  assert.equal(match.marker_suffix, '');
  assert.equal(match.fight_label, 'Fight #5');
  assert.equal(match.is_weight_override, false);
  assert.equal(match.is_mixed_type, false);
});

test('decorateMatchRow adds * for over-weight matches', () => {
  const match = decorateMatchRow({ ...baseMatch, weight_difference: 45 });
  assert.equal(match.marker_suffix, '*');
  assert.equal(match.fight_label, 'Fight #5*');
  assert.equal(match.is_weight_override, true);
});

test('decorateMatchRow adds ** for mixed type matches', () => {
  const match = decorateMatchRow({ ...baseMatch, wala_type: 'stag' });
  assert.equal(match.marker_suffix, '**');
  assert.equal(match.fight_label, 'Fight #5**');
  assert.equal(match.is_mixed_type, true);
});

test('decorateMatchRow adds *** when both overrides apply', () => {
  const match = decorateMatchRow({
    ...baseMatch,
    wala_type: 'bullstag',
    weight_difference: 50
  });
  assert.equal(match.marker_suffix, '***');
  assert.equal(match.fight_label, 'Fight #5***');
});
