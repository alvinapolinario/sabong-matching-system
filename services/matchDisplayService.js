function decorateMatchRow(match) {
  if (!match) return match;

  const giveTake = Number(match.give_take_grams || 0);
  const weightOverride = Number(match.weight_difference) > giveTake;
  const mixedType = match.meron_type !== match.wala_type;

  let markerSuffix = '';
  if (weightOverride && mixedType) markerSuffix = '***';
  else if (mixedType) markerSuffix = '**';
  else if (weightOverride) markerSuffix = '*';

  return {
    ...match,
    is_weight_override: weightOverride,
    is_mixed_type: mixedType,
    marker_suffix: markerSuffix,
    fight_label: markerSuffix ? `Fight #${match.fight_no}${markerSuffix}` : `Fight #${match.fight_no}`
  };
}

function decorateMatchRows(matches) {
  return matches.map(decorateMatchRow);
}

module.exports = {
  decorateMatchRow,
  decorateMatchRows
};
