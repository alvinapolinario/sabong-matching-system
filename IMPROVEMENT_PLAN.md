# Improvement Work Plan

Phased roadmap for the Sabong Matching System. Each phase has a clear goal, scoped tasks, and exit criteria. **Complete and sign off a phase before starting the next.**

> **Pre-phase (done):** Docker Compose stack (`Dockerfile`, `docker-compose.yml`), env-based `db.js`, `.env.example`

---

## How we work

1. Pick the current phase (start with **Phase 1**).
2. Work through tasks in order within the phase unless noted as parallel-safe.
3. Check off tasks as they ship.
4. Meet exit criteria → brief review → move to next phase.

**Status key:** `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 1 — Foundation & Configuration

**Goal:** Make the app safe to run outside local dev and easy for others to set up.

**Why first:** Everything else depends on reliable config and secrets handling.

| # | Task | Status |
|---|------|--------|
| 1.1 | Move `db.js` to env vars (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) | `[x]` |
| 1.2 | Add `.env.example` with all documented variables | `[x]` |
| 1.3 | Update README setup to reference `.env.example` | `[x]` |
| 1.4 | Fail fast in production if `SESSION_SECRET` or `LOGIN_PIN` are missing | `[x]` |
| 1.5 | Separate override passcodes from login PIN (require distinct env vars in prod) | `[x]` |
| 1.6 | Align project naming in README / `package.json` (Sabong Matching System) | `[x]` |

**Exit criteria**
- [x] App starts using only `.env` (no hardcoded DB credentials)
- [x] New developer can clone, copy `.env.example`, and run
- [x] Production misconfiguration fails loudly at startup

**Estimated effort:** 1–2 sessions

---

## Phase 2 — Matching Correctness & Tests

**Goal:** Lock down matching rules with tests and fix the highest-risk matching gaps.

**Why second:** Matching is the core product; tests prevent regressions as we change UX later.

| # | Task | Status |
|---|------|--------|
| 2.1 | Add test runner (e.g. Node built-in test or Vitest) + npm script | `[x]` |
| 2.2 | Extract pure matching helpers to a testable module (if needed) | `[x]` |
| 2.3 | Unit tests: `validateChicken`, `recommendedOpponents`, `noFightKey` | `[x]` |
| 2.4 | Unit tests: `findAutoPairs`, `pairPriority`, entry-gap behavior | `[x]` |
| 2.5 | Auto-match: support **partial matching** (match what you can, report skips) | `[x]` |
| 2.6 | After confirm, fetch single match by ID instead of reloading all matches | `[x]` |
| 2.7 | Document entry-gap rule (auto only) in matching board UI | `[x]` |

**Exit criteria**
- [x] Core matching helpers have passing unit tests
- [x] Auto-match no longer fails entirely when only some pairs are possible
- [x] Matching behavior is documented in code comments + UI where operators need it

**Estimated effort:** 2–3 sessions

---

## Phase 3 — Operator UX (Matching Board)

**Goal:** Reduce operator mistakes and speed up day-of-event workflow.

**Why third:** Builds on stable matching logic from Phase 2.

| # | Task | Status |
|---|------|--------|
| 3.1 | Expose no-fight pairs to matching board (API or page data) | `[x]` |
| 3.2 | Client warning: same owner, no-fight, over-weight before confirm | `[x]` |
| 3.3 | Replace `window.prompt()` with in-page modal for override passcode | `[x]` |
| 3.4 | Dim / highlight recommended opponents when a side is selected | `[x]` |
| 3.5 | Auto-match preview: show proposed pairs + count before committing | `[x]` |
| 3.6 | Auto-match result summary (matched / skipped / reason) | `[x]` |

**Exit criteria**
- [x] Operators get immediate feedback for invalid pairings before server round-trip
- [x] Override passcode works via modal (usable on tablet/TV setup)
- [x] Auto-match shows what will happen before irreversible confirm

**Estimated effort:** 2–3 sessions

---

## Phase 4 — Security & Audit Trail

**Goal:** Harden auth and leave a trace for sensitive manual overrides.

**Why fourth:** Config (Phase 1) must be in place; UX (Phase 3) defines where audit hooks attach.

| # | Task | Status |
|---|------|--------|
| 4.1 | Rate-limit `/login` (per IP, e.g. 5 attempts / 15 min) | `[x]` |
| 4.2 | `override_logs` table + persist weight/type override events | `[x]` |
| 4.3 | Log: event, chickens, difference, type mismatch, timestamp, session id | `[x]` |
| 4.4 | Optional admin view or export for override logs | `[x]` |
| 4.5 | Secure cookie flags for production (`secure`, `trust proxy`) | `[x]` |

**Exit criteria**
- [x] Brute-force PIN guessing is throttled
- [x] Every manual override is queryable in the database
- [x] Production session cookies follow HTTPS best practices

**Estimated effort:** 1–2 sessions

---

## Phase 5 — Real-time & Multi-operator

**Goal:** Keep all screens in sync when multiple people use the app at once.

**Why fifth:** Lower urgency for single-operator setups; higher value for live events.

| # | Task | Status |
|---|------|--------|
| 5.1 | Emit Socket events on fight reorder | `[ ]` |
| 5.2 | Emit Socket events on fight result / active-TV changes | `[ ]` |
| 5.3 | Matching board listens and refreshes on all match/fight events | `[ ]` |
| 5.4 | Live board + fights page subscribe to same event channels | `[ ]` |
| 5.5 | Smoke-test two-browser sync (matching + fights + live) | `[ ]` |

**Exit criteria**
- [ ] Changes on fights page appear on matching/live boards without manual refresh
- [ ] Documented Socket event contract in README or code

**Estimated effort:** 1–2 sessions

---

## Phase 6 — Operations & Deployment

**Goal:** Production-ready ops: health checks, backups, CI.

**Why sixth:** App behavior is stable; now focus on running it reliably.

| # | Task | Status |
|---|------|--------|
| 6.1 | `GET /health` endpoint (DB ping) | `[ ]` |
| 6.2 | GitHub Actions: install + test on push/PR | `[ ]` |
| 6.3 | Deployment notes (PM2/systemd, reverse proxy, MySQL backup schedule) | `[ ]` |
| 6.4 | Review backup/restore flow; document recovery procedure | `[ ]` |

**Exit criteria**
- [ ] CI runs tests on every push
- [ ] Health check usable by uptime monitor
- [ ] README has a “Production” section

**Estimated effort:** 1 session

---

## Phase 7 — Performance & Polish (Optional)

**Goal:** Optimize only if needed; address nice-to-haves.

**Do when:** Pool sizes grow large or operators report slowness.

| # | Task | Status |
|---|------|--------|
| 7.1 | Bucket auto-match candidates by type/weight before pairing | `[ ]` |
| 7.2 | Evaluate entry-gap semantics (block entry vs block entry-pair) with stakeholders | `[ ]` |
| 7.3 | Consider globally better pairing (if fairness complaints arise) | `[ ]` |

**Exit criteria**
- [ ] Measurable improvement or explicit decision not to change algorithm

**Estimated effort:** As needed

---

## Summary timeline

| Phase | Focus | Sessions (est.) |
|-------|--------|-----------------|
| **1** | Foundation & config | 1–2 |
| **2** | Matching tests & partial auto-match | 2–3 |
| **3** | Matching board UX | 2–3 |
| **4** | Security & audit | 1–2 |
| **5** | Real-time sync | 1–2 |
| **6** | CI & deployment | 1 |
| **7** | Performance (optional) | As needed |

**Total (Phases 1–6):** ~8–13 focused sessions

---

## Current phase

> **Phase 5 — Real-time & Multi-operator**  
> Next task: **5.1** Emit Socket events on fight reorder

---

## Decision log

Record choices made during implementation so later phases stay consistent.

| Date | Decision | Rationale |
|------|----------|-----------|
| | | |

---

## Changelog

| Date | Phase | Notes |
|------|-------|-------|
| 2026-07-29 | Phase 4 | Login rate limit, override audit log, trust proxy + secure cookies |
| 2026-07-29 | Phase 3 | Matching board UX: no-fight warnings, modals, auto-match preview |
| 2026-07-29 | Phase 2 | Matching service extraction, unit tests, partial auto-match |
| 2026-07-29 | Phase 1 | Central config module, production validation, Sabong branding |
| 2026-07-29 | — | Docker Compose stack added; db.js uses env vars |
| 2026-07-29 | — | Initial work plan created |
