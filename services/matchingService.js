const AUTO_MATCH_ENTRY_GAP = 5;

function normalizePair(ownerAId, ownerBId) {
  const first = Number(ownerAId);
  const second = Number(ownerBId);
  return first < second ? [first, second] : [second, first];
}

function typeAllowed(event, type) {
  if (type === 'cock') return Boolean(event.allow_cock);
  if (type === 'stag') return Boolean(event.allow_stag);
  if (type === 'bullstag') return Boolean(event.allow_bullstag);
  return false;
}

function weightRange(event, type) {
  return {
    min: Number(event[`${type}_min_weight`]),
    max: Number(event[`${type}_max_weight`])
  };
}

function validateChicken(chicken, event) {
  if (!chicken) return 'Gamecock not found.';
  if (Number(chicken.event_id) !== Number(event.event_id)) return 'Gamecock does not belong to this event.';
  if (chicken.status !== 'available') return `${chicken.wingband} is no longer available.`;
  if (!typeAllowed(event, chicken.type)) return `${chicken.type} is not allowed in this event.`;

  const range = weightRange(event, chicken.type);
  if (Number(chicken.weight) < range.min || Number(chicken.weight) > range.max) {
    return `${chicken.wingband} is outside the ${chicken.type} weight range (${range.min}-${range.max}g).`;
  }

  return null;
}

function noFightKey(ownerAId, ownerBId) {
  const [ownerA, ownerB] = normalizePair(ownerAId, ownerBId);
  return `${ownerA}:${ownerB}`;
}

function ownerPairBlocked(ownerAId, ownerBId, noFightSet = new Set()) {
  return noFightSet.has(noFightKey(ownerAId, ownerBId));
}

function recommendedOpponents(chickens, baseChicken, event, noFightSet = new Set()) {
  if (validateChicken(baseChicken, event)) return [];

  return chickens.filter((chicken) => {
    if (Number(chicken.chicken_id) === Number(baseChicken.chicken_id)) return false;
    if (Number(chicken.owner_id) === Number(baseChicken.owner_id)) return false;
    if (ownerPairBlocked(chicken.owner_id, baseChicken.owner_id, noFightSet)) return false;
    if (chicken.type !== baseChicken.type) return false;
    if (validateChicken(chicken, event)) return false;

    const difference = Math.abs(Number(chicken.weight) - Number(baseChicken.weight));
    return difference <= Number(event.give_take_grams);
  });
}

function validAutoCandidate(chicken, event) {
  return !validateChicken(chicken, event);
}

function recentEntrySet(recentFightEntries) {
  return new Set(recentFightEntries.flat().map((entryId) => Number(entryId)));
}

function countAvailableByEntry(chickens) {
  return chickens.reduce((counts, chicken) => {
    const entryId = Number(chicken.entry_id);
    counts.set(entryId, (counts.get(entryId) || 0) + 1);
    return counts;
  }, new Map());
}

function countUsedByEntry(pairs) {
  return pairs.reduce((counts, pair) => {
    [pair.meron, pair.wala].forEach((gamecock) => {
      const entryId = Number(gamecock.entry_id);
      counts.set(entryId, (counts.get(entryId) || 0) + 1);
    });
    return counts;
  }, new Map());
}

function pairPriority(pair, pairs, entryAvailableCounts, event) {
  const usedCounts = countUsedByEntry(pairs);
  const meronEntryId = Number(pair.meron.entry_id);
  const walaEntryId = Number(pair.wala.entry_id);
  const meronUsed = usedCounts.get(meronEntryId) || 0;
  const walaUsed = usedCounts.get(walaEntryId) || 0;
  const meronAvailable = entryAvailableCounts.get(meronEntryId) || 1;
  const walaAvailable = entryAvailableCounts.get(walaEntryId) || 1;
  const balanceScore = (meronUsed / meronAvailable) + (walaUsed / walaAvailable);
  const targetDifference = Number(event.give_take_grams) / 2;
  const targetDistance = Math.abs(pair.difference - targetDifference);
  const zeroDifferencePenalty = pair.difference === 0 ? Number(event.give_take_grams) + 1 : 0;

  return {
    balanceScore,
    zeroDifferencePenalty,
    targetDistance,
    difference: pair.difference,
    tieBreaker: Number(pair.meron.chicken_id) + Number(pair.wala.chicken_id)
  };
}

function comparePairPriority(candidate, current, pairs, entryAvailableCounts, event) {
  if (!current) return candidate;

  const candidatePriority = pairPriority(candidate, pairs, entryAvailableCounts, event);
  const currentPriority = pairPriority(current, pairs, entryAvailableCounts, event);
  const fields = ['balanceScore', 'zeroDifferencePenalty', 'targetDistance', 'difference', 'tieBreaker'];
  for (const field of fields) {
    if (candidatePriority[field] < currentPriority[field]) return candidate;
    if (candidatePriority[field] > currentPriority[field]) return current;
  }

  return current;
}

function findAutoPairs(chickens, event, recentFightEntries = [], entryGap = AUTO_MATCH_ENTRY_GAP, noFightSet = new Set()) {
  const recentHistory = recentFightEntries.map((entryPair) => [...entryPair]);
  const available = chickens
    .filter((chicken) => validAutoCandidate(chicken, event))
    .sort((a, b) => (
      a.type.localeCompare(b.type)
      || Number(a.weight) - Number(b.weight)
      || a.owner_name.localeCompare(b.owner_name)
      || Number(a.chicken_id) - Number(b.chicken_id)
    ));
  const used = new Set();
  const pairs = [];
  const entryAvailableCounts = countAvailableByEntry(available);

  while (true) {
    const blockedEntries = recentEntrySet(recentHistory);
    let bestPair = null;

    for (const base of available) {
      if (used.has(Number(base.chicken_id))) continue;
      if (blockedEntries.has(Number(base.entry_id))) continue;

      for (const opponent of available) {
        if (used.has(Number(opponent.chicken_id))) continue;
        if (Number(base.chicken_id) === Number(opponent.chicken_id)) continue;
        if (Number(base.owner_id) === Number(opponent.owner_id)) continue;
        if (ownerPairBlocked(base.owner_id, opponent.owner_id, noFightSet)) continue;
        if (base.type !== opponent.type) continue;
        if (blockedEntries.has(Number(opponent.entry_id))) continue;

        const difference = Math.abs(Number(base.weight) - Number(opponent.weight));
        if (difference > Number(event.give_take_grams)) continue;
        bestPair = comparePairPriority(
          { meron: base, wala: opponent, difference },
          bestPair,
          pairs,
          entryAvailableCounts,
          event
        );
      }
    }

    if (!bestPair) break;

    used.add(Number(bestPair.meron.chicken_id));
    used.add(Number(bestPair.wala.chicken_id));
    pairs.push(bestPair);
    recentHistory.push([Number(bestPair.meron.entry_id), Number(bestPair.wala.entry_id)]);
    while (recentHistory.length > entryGap) recentHistory.shift();
  }

  return pairs;
}

function summarizeAutoMatch(chickens, pairs, event) {
  const matchedIds = new Set(
    pairs.flatMap((pair) => [Number(pair.meron.chicken_id), Number(pair.wala.chicken_id)])
  );
  const eligible = chickens.filter((chicken) => validAutoCandidate(chicken, event));
  const unmatched = eligible.filter((chicken) => !matchedIds.has(Number(chicken.chicken_id)));

  return {
    matched_count: pairs.length,
    matched_gamecock_count: matchedIds.size,
    eligible_count: eligible.length,
    unmatched_count: unmatched.length
  };
}

function buildAutoMatchMessage(summary, entryGap = AUTO_MATCH_ENTRY_GAP) {
  const { matched_count, unmatched_count } = summary;

  if (matched_count === 0) {
    return `No valid auto matches found. ${unmatched_count} eligible gamecock${unmatched_count === 1 ? '' : 's'} remain (check entry spacing, weight, or no-fight rules).`;
  }

  let message = `Auto matched ${matched_count} fight${matched_count === 1 ? '' : 's'} with ${entryGap}-fight entry spacing.`;
  if (unmatched_count > 0) {
    message += ` ${unmatched_count} eligible gamecock${unmatched_count === 1 ? '' : 's'} could not be paired (entry spacing, weight, or no valid opponent).`;
  }
  return message;
}

function formatAutoMatchPreview(pairs) {
  return pairs.map((pair, index) => ({
    fight_index: index + 1,
    meron_owner: pair.meron.owner_name,
    meron_entry: pair.meron.entry_name,
    meron_weight: Number(pair.meron.weight),
    wala_owner: pair.wala.owner_name,
    wala_entry: pair.wala.entry_name,
    wala_weight: Number(pair.wala.weight),
    difference: pair.difference
  }));
}

module.exports = {
  AUTO_MATCH_ENTRY_GAP,
  normalizePair,
  typeAllowed,
  weightRange,
  validateChicken,
  noFightKey,
  ownerPairBlocked,
  recommendedOpponents,
  validAutoCandidate,
  recentEntrySet,
  countAvailableByEntry,
  countUsedByEntry,
  pairPriority,
  comparePairPriority,
  findAutoPairs,
  summarizeAutoMatch,
  buildAutoMatchMessage,
  formatAutoMatchPreview
};
