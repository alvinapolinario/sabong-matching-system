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
