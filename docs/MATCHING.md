# Matching Algorithm

Reference for auto-match, manual confirm, and performance-related design choices (Phase 7).

## Constraints (manual + auto)

| Rule | Manual confirm | Auto-match |
|------|----------------|------------|
| Same owner blocked | Yes | Yes |
| Owner no-fight pairs blocked | Yes | Yes |
| Gamecock must be `available` | Yes | Yes |
| Event type/weight range | Yes | Yes |
| Weight within give/take | Yes (override with passcode) | Yes |
| Mixed type | Yes (override with passcode) | No |
| Entry spacing | No | Yes |

## Auto-match flow

1. Load all **available** gamecocks for the event.
2. Build **type + weight buckets** (sorted by weight within each type).
3. Load the last **N** confirmed fights (`AUTO_MATCH_ENTRY_GAP`, default `5`).
4. Repeatedly pick the **best valid pair** until no pairs remain.
5. Create confirmed fights and mark gamecocks as `matched`.

### Pair priority (greedy)

When multiple pairs are valid, the algorithm prefers (in order):

1. **Entry balance** — entries with more available birds should not be over-used early.
2. **Non-zero weight difference** — exact same weight is penalized when give/take allows a spread.
3. **Target difference** — closer to half of give/take is preferred.
4. **Smaller difference** — tighter weight match.
5. **Stable tie-break** — lower sum of `chicken_id`.

This is a **greedy** heuristic: fast and predictable for live events. It does not solve global fairness (e.g. maximize total matches across the whole pool).

### Entry spacing (auto-match only)

**Current behavior: per-entry block**

If an **entry** (stable/team) appeared in any of the last **N** fights — as LEFT or RIGHT — **all** gamecocks from that entry are skipped until that fight falls outside the window.

Example with `N = 5`: if Entry A fought in fight #12, no bird from Entry A is auto-matched until fights #12–#16 have rolled out of the recent window.

**Alternative considered: entry-pair block**

Only block the exact pair `(Entry A, Entry B)` from repeating within N fights. Entry A could still match Entry C.

**Decision (Phase 7.2):** Keep **per-entry block**. It is simpler for operators (“this entry just fought, skip it entirely”) and prevents the same stable from appearing too often regardless of opponent. Manual confirm is unaffected — operators can still pair any valid birds.

Configure spacing with `AUTO_MATCH_ENTRY_GAP` in `.env` (default `5`).

### Override markers (display)

Manual override matches are flagged in the UI:

| Marker | Meaning |
|--------|---------|
| `*` | Over-weight (weight difference exceeds give/take) |
| `**` | Mixed type (e.g. Cock vs Stag) |
| `***` | Both |

Shown on Matching Board, Fight Schedule, Live Board, and Dashboard. Mixed-type fights also show type tags beside each side.

## Performance (Phase 7.1)

Auto-match previously compared every eligible bird against every other bird (**O(n²)** per round).

**Optimization:** candidates are grouped by **type**, sorted by **weight**, and only birds within `[baseWeight ± giveTakeGrams]` are considered using binary search on the sorted bucket. Same results, fewer comparisons — especially for large pools.

`recommendedOpponents` uses the same bucketing for manual recommendations.

## Global pairing (Phase 7.3)

**Considered:** global optimization (e.g. assign all pairs at once to maximize matches or minimize entry imbalance).

**Decision:** **Not implemented.** Greedy pairing is fast enough for typical derby sizes, behavior is covered by unit tests, and operators can adjust manually. Revisit only if fairness or match-count complaints arise at scale.

## Code map

| Module | Role |
|--------|------|
| `services/matchingService.js` | Pure matching rules, bucketing, auto-match |
| `controllers/matchingController.js` | HTTP/API, DB transactions, socket emits |
| `tests/matchingService.test.js` | Unit + regression tests |

## Related env vars

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUTO_MATCH_ENTRY_GAP` | `5` | Recent fights used for entry spacing |
| `MANUAL_WEIGHT_OVERRIDE_PASSCODE` | — | Over-weight manual match |
| `MANUAL_MIXED_TYPE_PASSCODE` | — | Mixed-type manual match |
