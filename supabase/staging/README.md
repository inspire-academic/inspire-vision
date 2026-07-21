# Inspire Mentorship — Slice 0 Staging Environment

An isolated Supabase project used only for testing schema/RLS changes before they ever touch production. Created 2026-07-12 as Slice 0 of the approved [Phase 3B P0 Pilot Operating Model](../../docs/assurance/mentorship/).

## Environment identifiers

| | Production | Staging |
|---|---|---|
| Project name | (inspire-vision, unnamed as "staging" — it's the only project) | `inspire-vision-staging` |
| Project ref | `ygtsrdwoikqnrbexjrtl` | `glisozcknfcvrltatipo` |
| URL | `https://ygtsrdwoikqnrbexjrtl.supabase.co` | `https://glisozcknfcvrltatipo.supabase.co` |
| Used by | `assets/supabase.js`, `netlify/functions/_lib/adminAuth.js` (both hardcoded) | `supabase/staging/staging.config.json` only |
| Service-role key held by this repo/session | No (never has been) | **No — deliberately, by Founder instruction.** Privileged operations are manual-dashboard-only. |

**No code in `mentorship/`, `netlify/functions/`, or `assets/` reads `staging.config.json`.** The two environments are connected by nothing except a human reading this file — that separation is the entire point of Slice 0.

## How to tell which environment a script is pointed at

Every script in `scripts/staging/` imports `assertStaging()` from `lib.mjs`, which prints the target project ref and URL as its first action, and throws before doing anything else if that ref ever matches the production ref (`ygtsrdwoikqnrbexjrtl`) — hardcoded as a denylist check, not something a config typo can silently bypass.

To check by hand: open `supabase/staging/staging.config.json` and compare `PROJECT_REF` against the table above.

## What has a service-role key, and what doesn't

**Nothing in this repo has the staging project's service-role key.** Per Founder instruction, the following are consequently **manual, dashboard-only operations** — never scripted, never delegated to a convenience shortcut:

- Deleting `auth.users` rows (accounts). `scripts/staging/reset.mjs` cleans up owned *data* rows via each account's own anon-key session, but cannot remove the account shell itself — it prints exactly which emails/IDs remain for manual deletion via **Supabase Dashboard → Authentication → Users**.
- Creating a `mentor_assignments` row. This table has no anon/authenticated INSERT policy at all, by design (service-role only, correctly) — the same property that made V-01 exploitable is exactly what's supposed to make this un-writable by a script. To test the *positive* "assigned mentor can read" RLS path in a later slice, the Founder inserts one row manually via the staging SQL Editor. The *negative* path (unassigned mentor denied) is fully scriptable and requires no privilege.
- Any other action that would require `service_role` in production (see the Phase 1/2 reports) is equally unavailable here, by the same design choice, not an oversight.

## Baseline schema setup (manual, one-time)

Run these five files, **in this order**, in the staging project's SQL Editor (Supabase Dashboard → SQL Editor). This is the identical, unmodified schema already running in production — Slice 0 does not add or change any table.

1. `supabase/mentorship_schema.sql`
2. `supabase/mentorship_schema_v2.sql`
3. `supabase/mentorship_schema_v3.sql`
4. `supabase/mentorship_schema_v3_fix_grants.sql`
5. `supabase/mentorship_schema_v3_fix_session_notes_rls.sql`

Each file ends with its own confirmation query (a `SELECT table_name ...` or `SELECT polname ...`) — paste the output back for the record.

**Auth setting required before scripts will work:** Authentication → Providers → Email → **Confirm email: off** (done at project creation, per Founder confirmation 2026-07-12) — matches production's actual behavior (Phase 2 finding), so signup returns an immediate usable session instead of stalling on an email that no SMTP is configured to send.

## Scripts

All in `scripts/staging/`, run with `node <script>.mjs` from the repo root or the `scripts/staging/` directory. Anon key only, throughout.

| Script | Purpose | Requires baseline schema applied first? |
|---|---|---|
| `lib.mjs` | Shared config loader, safety guard, REST helpers. Not run directly. | — |
| `verify-isolation.mjs` | Prints project identifiers, confirms staging ≠ production by URL/ref/anon-key comparison, confirms staging PostgREST is independently reachable. | No (identifier checks work regardless; the reachability check will show a non-2xx status if schema isn't applied yet). |
| `seed.mjs` | Creates two fixed-namespace synthetic students (`slice0-seed-student-{a,b}@inspire-staging.test`), writes one row into each owner-scoped baseline table, reads it back, and runs a live cross-account RLS denial test (student B can't read/alter student A's goal). | Yes. |
| `reset.mjs` | Signs back into both fixed-namespace accounts and deletes every row they own; reports which `auth.users` rows still need manual dashboard deletion. | Yes. |

### Synthetic account convention

- Domain: `@inspire-staging.test` (the reserved `.test` TLD — RFC 2606 — so nothing can ever be accidentally deliverable).
- Password: a single fixed, documented, non-secret value in `lib.mjs` (`SYNTHETIC_PASSWORD`). Not a real secret — these accounts hold no sensitive content and live in a database with zero production data; the fixed value is what lets `reset.mjs` log back in independently of `seed.mjs`'s process lifetime.
- Namespace tag: `slice0-seed-*` — every synthetic row created by these scripts is identifiable by this prefix.

## Re-running

`seed.mjs` is safe to re-run only after `reset.mjs` has cleaned up + the prior accounts have been manually deleted from the dashboard (Supabase signup will reject a duplicate email otherwise). If you just need fresh data under the *same* two accounts, `reset.mjs` alone is sufficient before re-seeding.
