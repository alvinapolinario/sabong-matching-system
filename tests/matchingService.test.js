const test = require('node:test');
const assert = require('node:assert/strict');
const Matching = require('../services/matchingService');

const baseEvent = {
  event_id: 1,
  give_take_grams: 30,
  allow_cock: 1,
  allow_stag: 1,
  allow_bullstag: 1,
  cock_min_weight: 1800,
  cock_max_weight: 2600,
  stag_min_weight: 1600,
  stag_max_weight: 2300,
  bullstag_min_weight: 1700,
  bullstag_max_weight: 2400
};

function chicken(overrides = {}) {
  return {
    chicken_id: 1,
    entry_id: 10,
    owner_id: 100,
    owner_name: 'Owner A',
    event_id: 1,
    type: 'cock',
    weight: 2000,
    wingband: 'WB-1',
    legband: 'LB-1',
    status: 'available',
    ...overrides
  };
}

test('noFightKey normalizes owner pair order', () => {
  assert.equal(Matching.noFightKey(5, 2), '2:5');
  assert.equal(Matching.noFightKey(2, 5), '2:5');
});

test('validateChicken rejects missing, wrong event, unavailable, and out-of-range birds', () => {
  assert.equal(Matching.validateChicken(null, baseEvent), 'Gamecock not found.');
  assert.match(
    Matching.validateChicken(chicken({ event_id: 2 }), baseEvent),
    /does not belong/
  );
  assert.match(
    Matching.validateChicken(chicken({ status: 'matched' }), baseEvent),
    /no longer available/
  );
  assert.match(
    Matching.validateChicken(chicken({ weight: 1500 }), baseEvent),
    /outside the cock weight range/
  );
  assert.equal(Matching.validateChicken(chicken(), baseEvent), null);
});

test('recommendedOpponents filters by owner, no-fight, type, weight, and availability', () => {
  const base = chicken({ chicken_id: 1, owner_id: 100, weight: 2000 });
  const pool = [
    base,
    chicken({ chicken_id: 2, owner_id: 200, entry_id: 11, weight: 2010 }),
    chicken({ chicken_id: 3, owner_id: 100, entry_id: 12, weight: 2010 }),
    chicken({ chicken_id: 4, owner_id: 300, entry_id: 13, weight: 2100, type: 'stag' }),
    chicken({ chicken_id: 5, owner_id: 400, entry_id: 14, weight: 2050, status: 'matched' }),
    chicken({ chicken_id: 6, owner_id: 500, entry_id: 15, weight: 2500 })
  ];
  const noFightSet = new Set([Matching.noFightKey(100, 600)]);

  const opponents = Matching.recommendedOpponents(
    [...pool, chicken({ chicken_id: 7, owner_id: 600, entry_id: 16, weight: 2010 })],
    base,
    baseEvent,
    noFightSet
  );

  assert.deepEqual(opponents.map((row) => row.chicken_id), [2]);
});

test('pairPriority prefers balanced entries and non-zero weight difference', () => {
  const event = { ...baseEvent, give_take_grams: 40 };
  const entryCounts = new Map([[10, 2], [11, 1]]);
  const pairA = {
    meron: chicken({ chicken_id: 1, entry_id: 10 }),
    wala: chicken({ chicken_id: 2, entry_id: 11, owner_id: 200 }),
    difference: 10
  };
  const pairB = {
    meron: chicken({ chicken_id: 3, entry_id: 10 }),
    wala: chicken({ chicken_id: 4, entry_id: 11, owner_id: 201 }),
    difference: 0
  };

  const priorityA = Matching.pairPriority(pairA, [pairA], entryCounts, event);
  const priorityB = Matching.pairPriority(pairB, [pairB], entryCounts, event);
  assert.ok(priorityA.zeroDifferencePenalty < priorityB.zeroDifferencePenalty);
});

test('findAutoPairs respects entry-gap blocking from recent fights', () => {
  const event = baseEvent;
  const birds = [
    chicken({ chicken_id: 1, entry_id: 10, owner_id: 100, weight: 2000 }),
    chicken({ chicken_id: 2, entry_id: 20, owner_id: 200, weight: 2010 }),
    chicken({ chicken_id: 3, entry_id: 10, owner_id: 101, weight: 2005 }),
    chicken({ chicken_id: 4, entry_id: 30, owner_id: 300, weight: 2015 })
  ];
  const recentFightEntries = [[10, 20], [10, 30], [20, 30], [10, 20], [30, 20]];

  const pairs = Matching.findAutoPairs(birds, event, recentFightEntries);
  assert.equal(pairs.length, 0);
});

test('findAutoPairs returns greedy valid pairs when some birds must remain unmatched', () => {
  const birds = [
    chicken({ chicken_id: 1, entry_id: 10, owner_id: 100, weight: 2000 }),
    chicken({ chicken_id: 2, entry_id: 20, owner_id: 200, weight: 2010 }),
    chicken({ chicken_id: 3, entry_id: 30, owner_id: 300, weight: 2005 })
  ];

  const pairs = Matching.findAutoPairs(birds, baseEvent);
  assert.equal(pairs.length, 1);
  assert.equal(Matching.summarizeAutoMatch(birds, pairs, baseEvent).unmatched_count, 1);
});

test('buildAutoMatchMessage reports partial matching summary', () => {
  const summary = {
    matched_count: 2,
    unmatched_count: 3
  };
  const message = Matching.buildAutoMatchMessage(summary);
  assert.match(message, /Auto matched 2 fights/);
  assert.match(message, /3 eligible gamecocks could not be paired/);
});

function findAutoPairsBrute(chickens, event, recentFightEntries = [], entryGap = 5, noFightSet = new Set()) {
  const recentHistory = recentFightEntries.map((entryPair) => [...entryPair]);
  const available = chickens
    .filter((chicken) => Matching.validAutoCandidate(chicken, event))
    .sort(Matching.compareEligibleChickens);
  const giveTakeGrams = Number(event.give_take_grams);
  const used = new Set();
  const pairs = [];
  const entryAvailableCounts = Matching.countAvailableByEntry(available);

  while (true) {
    const blockedEntries = Matching.recentEntrySet(recentHistory);
    let bestPair = null;

    for (const base of available) {
      if (used.has(Number(base.chicken_id))) continue;
      if (blockedEntries.has(Number(base.entry_id))) continue;

      for (const opponent of available) {
        const candidatePair = Matching.considerAutoPair(
          base,
          opponent,
          blockedEntries,
          used,
          noFightSet,
          giveTakeGrams
        );
        if (!candidatePair) continue;

        bestPair = Matching.comparePairPriority(
          candidatePair,
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

function pairSignature(pairs) {
  return pairs
    .map((pair) => [
      Number(pair.meron.chicken_id),
      Number(pair.wala.chicken_id),
      pair.difference
    ].sort((a, b) => a - b).join('-'))
    .sort()
    .join('|');
}

function randomChicken(id, overrides = {}) {
  const types = ['cock', 'stag', 'bullstag'];
  const type = types[id % types.length];
  return chicken({
    chicken_id: id,
    entry_id: 10 + (id % 12),
    owner_id: 100 + (id % 20),
    owner_name: `Owner ${100 + (id % 20)}`,
    entry_name: `Entry ${10 + (id % 12)}`,
    type,
    weight: 1900 + (id % 40) * 5,
    wingband: `WB-${id}`,
    ...overrides
  });
}

test('weightCompatibleRange limits candidates to give/take window', () => {
  const bucket = [
    chicken({ chicken_id: 1, weight: 2000 }),
    chicken({ chicken_id: 2, weight: 2010 }),
    chicken({ chicken_id: 3, weight: 2050 }),
    chicken({ chicken_id: 4, weight: 2100 })
  ];
  const range = Matching.weightCompatibleRange(bucket, 2010, 30);
  assert.equal(range.start, 0);
  assert.equal(range.end, 2);
});

test('findAutoPairs matches brute-force results on varied pools', () => {
  const pools = [
    [
      chicken({ chicken_id: 1, entry_id: 10, owner_id: 100, weight: 2000 }),
      chicken({ chicken_id: 2, entry_id: 20, owner_id: 200, weight: 2010 }),
      chicken({ chicken_id: 3, entry_id: 30, owner_id: 300, weight: 2005, type: 'stag' }),
      chicken({ chicken_id: 4, entry_id: 40, owner_id: 400, weight: 2015 })
    ],
    Array.from({ length: 24 }, (_, index) => randomChicken(index + 1)),
    Array.from({ length: 48 }, (_, index) => randomChicken(index + 1))
  ];
  const recentHistory = [[10, 20], [30, 40]];

  for (const pool of pools) {
    const optimized = Matching.findAutoPairs(pool, baseEvent, recentHistory);
    const brute = findAutoPairsBrute(pool, baseEvent, recentHistory);
    assert.equal(pairSignature(optimized), pairSignature(brute));
  }
});

test('findAutoPairs completes large pools quickly with bucketing', () => {
  const pool = Array.from({ length: 200 }, (_, index) => randomChicken(index + 1));
  const started = performance.now();
  const pairs = Matching.findAutoPairs(pool, baseEvent);
  const elapsedMs = performance.now() - started;

  assert.ok(pairs.length > 0);
  assert.ok(elapsedMs < 250, `expected bucketing under 250ms, got ${elapsedMs.toFixed(1)}ms`);
});
