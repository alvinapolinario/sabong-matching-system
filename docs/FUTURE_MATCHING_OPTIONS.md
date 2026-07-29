# Future Matching Options

Optional enhancements discussed after Phase 7. Neither is required for correctness today; implement only if operators report real pain on the derby floor.

**Related docs:** [MATCHING.md](./MATCHING.md) · [IMPROVEMENT_PLAN.md](../IMPROVEMENT_PLAN.md)

---

## Context: what auto-match does today

Auto-match runs in rounds:

1. Look at all available birds.
2. Pick **one** “best” valid pair (greedy).
3. Remove those birds from the pool.
4. Update the recent-fight window for entry spacing.
5. Repeat until no valid pairs remain.

Two separate design choices are baked in:

| Choice | Current behavior |
|--------|------------------|
| **Spacing** | **Per-entry block** — if Entry A fought recently, *all* birds from Entry A are skipped |
| **Pairing** | **Greedy** — each round picks the locally best pair; no look-ahead across the whole pool |

Manual confirm ignores spacing entirely. Operators can always pair by hand.

---

## Option A: Entry-pair spacing mode

### What it means

**Per-entry (current):**  
Recent fights contribute a set of **entry IDs**. If your entry is in that set, you cannot auto-match at all.

**Entry-pair (alternative):**  
Recent fights contribute a set of **unordered entry pairs**, e.g. `(Entry 10, Entry 20)`. Auto-match blocks **only** repeating that exact pairing. Entry 10 could still fight Entry 30; Entry 20 could fight Entry 40.

Today, spacing is implemented via `recentEntrySet()` in `services/matchingService.js`, which flattens recent fights into a set of blocked entry IDs. Entry-pair mode would instead track normalized pair keys such as `"10:20"`.

### Example scenario

Recent fights (`N = 5`):

| Fight | LEFT entry | RIGHT entry |
|-------|------------|-------------|
| #11 | A | B |
| #12 | C | D |
| … | … | … |

**Pool:** Entry A has 3 birds left. Entry B has 2. Entry C has 4.

| Mode | Can A vs B auto-match? | Can A vs C? | Can B vs D? |
|------|------------------------|-------------|-------------|
| **Per-entry (now)** | No (A blocked, B blocked) | No (A blocked) | No (B blocked) |
| **Entry-pair** | No (A–B pair blocked) | Yes | Yes |

### Why per-entry was chosen (Phase 7.2)

- **Operator clarity:** “That stable just fought — don’t use them yet.” Easy to explain on the derby floor.
- **TV / crowd perception:** Same entry name appearing again quickly can look wrong even against a different opponent.
- **Conservative:** Fewer auto-matches, but fewer complaints about “why is Team X fighting again?”

### When entry-pair mode helps

- **Large entries, many birds per stable:** Per-entry can leave a lot of birds stranded after one fight from that entry.
- **High match throughput:** You want auto-match to fill the card faster without manual work.
- **Spacing intent is really “no rematches”:** Stakeholders care about A vs B repeating, not A appearing at all.

**Pain signal:**

> “We had 8 birds left from Entry A but auto-match skipped all of them because one bird from A fought 3 fights ago.”

### Tradeoffs

| | Per-entry | Entry-pair |
|---|-----------|------------|
| Match count | Lower | Higher |
| Same entry on card twice in short window | Never (auto) | Possible vs different opponents |
| Operator mental model | Simple | Harder (“blocked pairing, not blocked entry”) |
| Edge cases | Straightforward | Need rules for A–B vs B–A (normalize pair order) |

### Implementation sketch

1. Add env var, e.g. `AUTO_MATCH_SPACING_MODE=entry|entry_pair` (default `entry`).
2. Replace `recentEntrySet()` with `recentEntryPairSet()` when mode is `entry_pair`.
3. Check in `considerAutoPair()` whether `(base.entry_id, opponent.entry_id)` is blocked.
4. Update matching board copy and auto-match preview so operators see which mode is active.
5. Add unit tests for both modes (extend existing entry-gap tests).

**Estimated effort:** ~half a session — mostly logic, tests, and UI text.

### Recommendation

Only add this if operators **explicitly** say per-entry is too strict. It is a **product/rules** change, not a performance fix. Could also be offered **per event** in the database if some derbies want strict spacing and others want rematch-style spacing.

---

## Option B: Global pairing optimization

### What it means

Today the algorithm is **greedy**: each round commits to one pair without knowing what that choice does to the rest of the pool.

**Global optimization** means: consider the **whole batch** of auto-matches at once and choose a set of pairs that optimizes an objective, for example:

- **Maximize** number of fights created
- **Minimize** entry imbalance (spread birds evenly across entries)
- **Minimize** total weight mismatch
- **Weighted combination** of the above

Greedy can fail in subtle ways when constraints bind.

### Example where greedy can lose

Available birds (same type, give/take = 30g):

| Bird | Entry | Weight |
|------|-------|--------|
| 1 | E10 | 2000g |
| 2 | E20 | 2010g |
| 3 | E10 | 2020g |
| 4 | E30 | 2030g |

Greedy might take **(1, 2)** first because it is a strong weight match. That uses both E10 and E20’s “first” birds.

What remains: Bird 3 (E10, 2020) and Bird 4 (E30, 2030) — still valid, difference 10g. You still get 2 fights in this small example.

With a **larger pool** and tighter constraints (spacing, entry balance, no-fight rules), greedy’s early commits can leave **more birds unmatched** than a global solver would. That is the core complaint:

> “Auto-match only got 12 fights but we could have had 15.”

### What global pairing could optimize

Define a **scoring function** for a full set of pairs `P`:

```
score(P) =
  + w1 × (number of pairs)
  - w2 × entry imbalance penalty
  - w3 × sum of weight target distances
  - w4 × zero-difference penalty
  - w5 × spacing violations (if soft constraints)
```

Then search for the set of disjoint pairs with the best score.

### Possible algorithms

| Approach | Idea | Pros | Cons |
|----------|------|------|------|
| **Greedy (current)** | Best pair each round | Fast, predictable, easy to debug | Suboptimal match count / fairness |
| **Max-weight matching** | Graph: edge = valid pair, weight = pair score; find max total weight matching | Polynomial time; good for “maximize quality × count” | Harder to encode all entry-balance rules; one bird per pair only |
| **ILP / CP-SAT** | Binary vars: x[i,j] = 1 if birds i,j paired | Full control over constraints and objectives | Heavier dependency, slower, harder to explain |
| **Beam search / backtracking** | Explore top-k choices per step | Middle ground | Still heuristic; needs tuning |

For sabong, a practical “global” upgrade is often:

**Maximum-weight matching on a conflict graph**

- Nodes = available birds
- Edge between *i* and *j* if pairing is valid (weight, owner, no-fight, spacing)
- Edge weight derived from `pairPriority()` scores
- Run **maximum weight matching** (e.g. blossom algorithm) → assigns all pairs in one pass

That maximizes **global** match quality/count instead of committing early each round.

### Tradeoffs

| | Greedy (now) | Global optimization |
|---|--------------|---------------------|
| Match count | Can leave birds unmatched unnecessarily | Usually higher when constraints bind |
| Fairness across entries | Local balance heuristic only | Can optimize explicitly |
| Speed | ~50ms for 200 birds (with bucketing) | Depends on algorithm; often still fast for hundreds of nodes |
| Predictability | Same input → same output; easy to explain | Harder: “why wasn’t my bird picked?” |
| Implementation | Done | New module, tests, preview must show full plan |
| Debugging | Easy | Need logging: “global score favored other pairs” |

### When it is worth it

**Signals from the field:**

- “Auto-match leaves too many birds on the table.”
- “Entry X always gets matched first and Entry Y never gets a fight.”
- “We run auto-match and feel the count is consistently low given the pool.”

**When it is not worth it:**

- Pools are small (< 30 birds); greedy already matches almost everything.
- Operators prefer manual control and use auto-match as a helper.
- Complaints are about **spacing rules**, not pairing quality — fix spacing mode first.

### Implementation sketch

1. **Build valid-pair graph** — reuse `considerAutoPair()` and spacing checks.
2. **Score each edge** using existing `pairPriority()` (inverted to weight).
3. **Run max-weight matching** (library or blossom implementation).
4. **Compare in preview:** optionally show greedy vs optimized counts before commit.
5. **Feature flag:** `AUTO_MATCH_STRATEGY=greedy|global` for safe rollout.
6. **Tests:** small fixtures where greedy ≠ global; property tests that global never violates hard constraints.

**Estimated effort:** ~2–4 sessions — algorithm integration, edge cases, preview UI, regression tests.

**Important nuance:** Spacing today is based on **already confirmed fights**, not fights created in the *same* auto-match batch. Both greedy and global use the same rule unless you also add “intra-batch spacing” (birds paired in pass 1 block pass 2 in the same run) — that would be a separate product decision.

---

## How the two options interact

They solve **different** problems:

```
Entry spacing mode  →  WHO is allowed to fight (filter)
Global pairing      →  WHICH allowed pairs to pick together (optimizer)
```

You can combine them:

| Config | Effect |
|--------|--------|
| Per-entry + greedy | Most conservative; fewest auto matches; simplest (**current default**) |
| Per-entry + global | Better use of whoever *is* allowed to fight |
| Entry-pair + greedy | More candidates; still locally optimal |
| Entry-pair + global | Most aggressive auto-match; highest complexity |

**Typical progression if operators complain:**

1. **First:** Clarify spacing intent → maybe switch to entry-pair (cheap, big impact on match count).
2. **Second:** If still unhappy with *which* pairs get chosen → global optimization.
3. **Always:** Keep manual confirm and preview so operators see the plan before commit.

---

## Practical recommendation

**Stay on current defaults** unless you hear specific feedback:

| Complaint | Likely fix |
|-----------|------------|
| “Same team fighting too often” | Keep per-entry; maybe increase `AUTO_MATCH_ENTRY_GAP` |
| “Too many birds skipped after one fight” | Entry-pair spacing mode |
| “Auto-match doesn’t pack enough fights” | Entry-pair first; then global if still short |
| “One entry hogs fights / another starves” | Global pairing with entry-balance objective |

Neither option is required for correctness. Both are **optional product knobs** for real derby operations.

---

## Suggested build order

| Priority | Option | Why |
|----------|--------|-----|
| 1 | Entry-pair spacing | Smaller change; directly tied to floor language; easy to revert via env var |
| 2 | Global pairing | Better when the question shifts from *“who is allowed?”* to *“are we leaving fights on the table?”* |

---

## Decision log (placeholder)

Record here when a future option is implemented or explicitly rejected.

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-29 | Deferred both options | Phase 7: greedy + per-entry sufficient for typical pool sizes |
| | | |
