# Inspire Mentorship — Founder E2E Round-Trip Assurance Report

**Status: DRAFT — Phase 1-3 discovery + static/API verification complete. Live account walkthrough not yet performed (pending Founder direction). Browser-level checks (console, network, visual, accessibility) not performed this session — no browser-automation tool is available; see Methodology.**

## Current State (2026-07-25) — read this first

Everything below the "Resolution Update" section is a **frozen snapshot
of the 2026-07-12 codebase** (commit `38f9a1f`), kept intact on purpose
as a historical record — it is not a live description of the module.
In particular, the bolded verdicts further down (`Round-Trip Verdict:
FAILED`, `Founder Walkthrough: Blocked`, the Final Readiness Assessment
block) describe a state that **no longer applies**.

As of today, code review confirms: the mentor↔student round trip
exists (F-01/F-02 resolved), an in-app safeguarding queue exists
(F-03 resolved), the unauthenticated help-request endpoint now
requires auth (F-04 resolved), the mentor-approval picker sources a
non-spoofable table (F-05 resolved), and the dashboard's light theme
was already working, contrary to a stale code comment (F-06 resolved).
No stub pages remain anywhere in the module. None of this has been
re-verified live in a browser this session (no browser-automation tool
was available) or against real accounts in the shared production
Supabase project — see "Open Decisions for the Founder" at the bottom,
none of which have been answered yet.

**Bottom line:** the structural blockers this report originally found
are fixed at the code level. What's left is (1) the three open
Founder decisions below, and (2) an actual live/browser-tooled pass to
confirm the code-level fixes hold up in practice — this report
upgrades that from "blocked by missing round-trip" to "blocked by
never having been run."

### Live Verification — 2026-07-25 (Founder-approved)

Per Founder sign-off, two of the three open decisions below were acted
on:

- **Synthetic test account created** via the real `join.html` signup
  flow (REST call to Supabase Auth, same client the page itself uses):
  `inspire.science.uk+claudetest-student-20260725@gmail.com`, user id
  `81ff1652-f534-4fb7-9d28-a7241502c9df`. Email confirmation is off for
  this project, so the account is immediately live with role
  `mentee`. **Not yet cleaned up** — needs deleting from Supabase Auth
  (Dashboard → Authentication → Users, or the Admin API) once no
  longer needed; this Claude session has no service-role access to
  delete it directly.
- **F-04 live-fire confirmation, both halves tested:**
  - Unauthenticated POST to `/.netlify/functions/notify-help-request`
    on the live `staging.staging.inspirevision.org` deploy → **401
    `{"error":"Missing Authorization header"}`**, confirming the fix
    actually blocks unauthenticated callers, not just in source.
  - Same request with the synthetic account's bearer token → **200
    `{"sent":true,"messageId":"fb4182df-6fea-494c-a580-32a7f54863b7"}`**
    — one real email sent to whatever `HELP_REQUEST_NOTIFY_EMAIL` is
    configured to, body clearly marked `[CLAUDE TEST - please
    ignore/delete]`.
- **Not done:** the mentor-side of the round trip was not live-walked.
  That requires either admin credentials (to approve a test mentor
  application via `admin/mentors.html`, gated by the `ADMIN_EMAILS`
  allowlist) or a connected browser session to do it by hand — neither
  was available this session. The round trip remains verified by code
  review only (see F-01/F-02 above), not by a live account walkthrough.

## Resolution Update (2026-07-25)

The findings below reflect the module's state as of commit `38f9a1f`
(2026-07-12). Code-reviewed against the current codebase (`8889aea`,
2026-07-23) as follows — this is a code-level re-check, not a live
re-exploitation pass:

- **F-01 (round-trip missing, CRITICAL) — RESOLVED.** `fa45d8e feat:
  schema for the mentor<->student round trip (F-01) + real
  mentor-approval source of truth` added the mentor-visible read path.
- **F-02 (dead `sessions` table) — RESOLVED.** `mentor-portal/sessions.html`
  now creates and edits real `mentorship.sessions` rows (`ca36ad3`,
  `84c7a33`).
- **F-03 (no in-app safeguarding queue) — RESOLVED.** `dfbef0d feat:
  real in-app safeguarding queue for Ask for Help / Prayer & Support
  (F-03)`, plus `admin/safeguarding.html` built out (`0b4bcf2`).
- **F-04 (unauthenticated help-request email) — RESOLVED.** `63c496d
  fix: notify-help-request.js had no auth check at all (V-02)` — now
  requires a valid bearer token and derives student identity
  server-side from the verified session, not the request body.
- **F-05 (client-writable `mentor_status` self-elevation) — RESOLVED.**
  See `docs/assurance/mentorship/FOLLOWUP-mentor-status-spoofable-picker.md`
  — `admin-matching.js`'s picker now sources approval status from the
  service-role-only `mentorship.mentor_applications` table (`8889aea`).
- **F-06 (dashboard light mode) — RESOLVED, and was already resolved at the
  time this report's own commit (`38f9a1f`) was tested.** `a23c01f fix:
  light/dark theme toggle on the mentorship dashboard did nothing` plus
  three same-day follow-ups (`75e7a27`, `c9f948b`, `ad6030e`) added the
  full `[data-theme="light"]` surface/text/border override block to
  `mentorship/css/mentorship.css` and fixed the legibility bugs that
  first pass turned up (hero headline, compass grid, Daily Encouragement
  card). All four commits are ancestors of `38f9a1f`. The finding was
  stale: it was based on a leftover comment in `dashboard/index.html`
  claiming no light theme existed, which was never updated after the
  CSS moved to the shared stylesheet — that comment has now been
  corrected (2026-07-25). Re-verified 2026-07-25 by code review only;
  no browser-automation tool was available this session to confirm
  visually (see Open Decisions).
- **Public STUB pages** (`index`, `philosophy`, `parents`, `journey`,
  `resources`, `stories`) and **admin STUB pages** (`index`, `mentees`,
  `reports`, `safeguarding`) listed below — all built out since
  (`41d982d`, `4303f31`, `5ee857e`, `0b4bcf2`, `584f457`, `dfbef0d`,
  and others). None of the module's pages are stubs as of 2026-07-25.

**The "Round-Trip Verdict: FAILED" and "Recommendation: Repair
required" lines below are historical** — they applied to the
2026-07-12 codebase and are superseded by the F-01/F-02 fixes above.
This report is kept intact rather than rewritten so the original
findings remain an accurate record of what was found and when.

## Executive Summary

- **Round-trip verdict: FAILED.** There is no implemented mechanism by which a mentor can see anything a student writes (goals, journal, check-ins, tasks, help requests), and no mechanism by which mentor output ever becomes visible to a student. This is not an untested gap — it is confirmed absent from the code (see Finding F-01).
- The module is far more built than the repo's own `CLAUDE.md` (dated 2026-07-09) claims. Login, signup, 5-step onboarding, the full student dashboard (8/8 pages), the full mentor-portal (4/4 pages), and 2 of 6 admin pages are genuinely wired to a live, RLS-protected Supabase schema — not stubs, not mock data.
- One real, unauthenticated write endpoint: `netlify/functions/notify-help-request.js` has no auth/allowlist check (confirmed by source; not yet confirmed live to avoid sending a real email without sign-off).
- No isolated test environment exists: `staging` and `main` both point at the same live Supabase project (URL/anon key hardcoded, not env-branched). Any write-path testing (creating accounts, submitting goals, etc.) would write into the same database production uses.
- No automated test coverage exists at all (no Playwright, no CI).

**Recommendation: Repair required before Founder walkthrough.** The round-trip is the core acceptance criterion for this module and it cannot currently pass under any account combination — this isn't a matter of finding the right test data.

## Environment & Methodology

- Repository: `C:\Deploy_Inspire_Vision`, branch `main` (in sync with `staging` — main is 3 commits ahead, staging has nothing unique), clean working tree except an unrelated untracked `Founder Page.png`.
- Commit tested: `38f9a1f` (HEAD at session start, 2026-07-12).
- Supabase project: `ygtsrdwoikqnrbexjrtl` (shared with inspire-academic; Vision uses `mentorship.*` / `vision.*` schemas).
- **No browser-automation tool was available in this session** (checked via tool search — no Playwright/chrome-devtools MCP registered). Per Founder direction, this pass is code review + read-only live API verification only. Phases requiring actual browser interaction (console/network inspection, visual layout, click-through UX, mobile-width behaviour, accessibility) are marked **NOT TESTABLE THIS SESSION** below, with a manual checklist for a human/browser-tooled pass.
- Live read-only verification performed: anonymous `GET` requests (public anon key only, no auth) against all 8 `mentorship.*` tables via PostgREST, and unauthenticated/invalid-token requests against `admin-mentors` and `admin-matching`. All were non-destructive (no writes). No synthetic accounts were created and no rows were written — that requires Founder sign-off given the shared production database (see Open Decisions).

## System Reality (supersedes CLAUDE.md)

| Area | Reality |
|---|---|
| Build | Static HTML/CSS/JS, no bundler, `netlify.toml` publish="." |
| Backend | Hosted Supabase (Postgres + Auth + PostgREST), 3 Netlify Functions |
| Auth | Single shared Supabase Auth for the whole site; no separate mentorship auth |
| Role storage | `auth.users.user_metadata.mentorship_role` / `mentor_status` — **not** a table |
| Data | 8 tables under `mentorship` schema, all RLS-enabled, all confirmed live-exposed |
| Test tooling | None (no Playwright/Cypress, no `/tests`, no CI workflows) |
| Test environment | None — staging and production share one live database |

## Journey Coverage

Legend: REAL = wired to live Supabase and functionally complete for its scope. PARTIAL = wired but with a material gap. STUB = generic 22-line "coming soon" template only.

### Public visitor
| Route | Status | Notes |
|---|---|---|
| `mentorship/index.html` | STUB | Coming-soon template |
| `mentorship/philosophy.html` | STUB | Coming-soon template |
| `mentorship/parents.html` | STUB | Coming-soon template |
| `mentorship/join.html` | REAL | Mentee signup (`auth.signUp`, sets `mentorship_role: 'mentee'`) |
| `mentorship/mentors.html` | REAL | Mentor application (`mentor_status: 'pending_review'`), never auto-redirects into the portal |
| `mentorship/login.html` | REAL | Shared sign-in; `redirectForRole()` branches on role/status |
| `mentorship/journey.html`, `resources.html`, `stories.html` | REAL, but auth-gated | **Finding:** these sit at the public URL level but redirect unauthenticated visitors to login — a visitor cannot preview programme content, testimonies, or resources before signing up. Worth a product decision, not a bug. |

### New/returning student
Signup → (email verification, Supabase default) → login → `redirectForRole()` → onboarding if `!onboarding_complete` → `welcome → know-me → strengths → life-wheel → goals` (5/5, real Supabase insert on the last step) → dashboard. All 5 onboarding steps are REAL. Note: steps 2-4 write to `user_metadata`, not a table — only step 5 (goals) hits `mentorship.goals`.

Dashboard (8/8 REAL): `index`, `goals`, `growth-compass`, `check-in`, `journal`, `mentor`, `prayer-support` all read/write live `mentorship.*` tables scoped to `student_id = auth.uid()`. Every page independently re-checks `getUser()` and redirects to login if absent.

**Finding (F-02, moderate):** `dashboard/mentor.html` and the dashboard home's "next session" widget query `mentorship.sessions` — a table nothing in the codebase ever writes to (see F-01). These will always render their empty state, by construction, not due to missing test data.

### Mentor
Application (`mentors.html`) → `pending_review` → admin approval (`admin/mentors.html` → `admin-mentors.js`, server-side `ADMIN_EMAILS` allowlist gate, verified live 401 on missing/invalid auth) → `mentor_status: 'approved'` → login → mentor-portal (role-gated on `mentorship_role === 'mentor' && mentor_status === 'approved'`).

Mentor-portal (4/4 REAL): `index`, `mentees` (both read `mentor_assignments` only), `session-notes` (reads/writes `session_notes`, correctly re-verifies the assignment exists before allowing a note — a real, well-built guard), `resources` (static content).

**Finding (F-01, CRITICAL / Severity 1):** No mentor-portal page reads `goals`, `journal_entries`, `check_ins`, `tasks`, or `help_requests` — grep-confirmed zero matches across `mentorship/mentor-portal/*`. A mentor cannot see anything a student does. Conversely, `session_notes` RLS has no student-SELECT policy, so anything a mentor writes is invisible to the student. **There is no round-trip path in either direction.**

### Admin
`admin/mentors.html` (approval queue) and `admin/matching.html` (assign/end pairings) are REAL, both delegate authorization entirely to server-side `requireAdmin()` (bearer token + `ADMIN_EMAILS` allowlist) — verified live, correctly rejects unauthenticated and garbage-token requests with 401. `admin/index.html`, `mentees.html`, `reports.html`, `safeguarding.html` are STUBS — there is no admin landing page, no mentee roster, no reporting, and **no safeguarding tooling** despite `help_requests` existing as a table.

**Finding (F-03, high):** `help_requests` RLS is owner-only (student can read their own row; nothing else can). No admin or mentor UI queries this table at all. The only distribution mechanism is `notify-help-request.js`, an **unauthenticated** function that emails whoever `HELP_REQUEST_NOTIFY_EMAIL` is set to. There is no in-app safeguarding queue, no read receipt, no reply mechanism — a student's help request is invisible inside the product itself and depends entirely on an external, unauthenticated email side-channel.

**Finding (F-04, Severity 1/2, security):** `notify-help-request.js` has no session or allowlist check (source-confirmed: no `requireAdmin`/auth import, unlike the other two functions). Any unauthenticated caller can POST arbitrary category/message/name/email and trigger an email to the configured recipient. Not yet live-tested (would send a real email) — pending sign-off.

**Finding (F-05, low/informational):** Mentor role/status lives in self-writable `user_metadata`. A user could theoretically call `updateUser({data:{mentorship_role:'mentor', mentor_status:'approved'}})` from devtools to flip their own client-side redirect gate. RLS on `mentor_assignments`/`session_notes` is keyed to `auth.uid()`, not to this metadata, so it appears to only fool the client-side redirect (a self-declared "mentor" still has zero assignment rows and RLS blocks writes to session_notes for rows they don't own) — recommend a live confirmation test before fully closing this out.

**Finding (F-06, cosmetic):** Dashboard's light/dark theme toggle changes the icon only — `dashboard/index.html` has no actual light-mode CSS defined for itself (per its own code comment), despite tokens.css light-mode work having been done elsewhere in the repo.

## NOT TESTABLE THIS SESSION (requires a browser-tooled or manual pass)

- Actual click-through of public navigation, CTAs, broken images/links, mobile/tablet/desktop layout, browser back/forward, direct-route refresh.
- Console errors, network failures, response codes observed live in-browser, hydration/promise-rejection errors.
- Visual/UX quality: empty-state tone, age-appropriate language, accessibility (contrast, focus states, heading order, screen-reader labels), zoom behaviour.
- Live confirmation of F-04 (unauthenticated email trigger) and F-05 (client-side metadata self-elevation) — both are code-confirmed but not exercised live pending Founder approval, since both have real side effects (an email send; writing to shared production auth).
- The actual student/mentor/admin account walkthrough (Phases 5-8 of the original brief) — blocked on a decision about creating synthetic accounts in the shared production database (no isolated test project exists).

## Round-Trip Verdict

**FAILED.** Independent of any account-level testing, the code contains no path for student-authored content (goals, journal, check-ins, tasks, help requests) to reach a mentor, and no path for mentor output (session notes) to reach a student. `mentorship.sessions` — the one table both sides read — is never written by any code path. This is a structural gap, not a data/configuration issue, and no combination of test accounts would make it pass as currently built.

## Final Readiness Assessment

```
Architecture ................. Sound (static + Supabase + RLS), but no isolated test environment
Public Navigation ............ Partially blocked by auth-gating on journey/resources/stories — not testable live this session
Authentication ............... Real, single shared Supabase Auth; live-verified server-side admin gates work
Student Onboarding ........... Implemented, 5/5 real steps
Student Dashboard ............ Implemented, 8/8 real pages, RLS-scoped
Goals/Growth Map .............. Implemented and RLS-scoped
Weekly Planning ............... Not a distinct feature; tasks exist but "sessions" (mentor-facing scheduling) is dead
Reflections (journal) ......... Implemented and RLS-scoped
Help/Communication ............ Broken as a two-way channel — no admin/mentor visibility, unauthenticated send endpoint
Mentor Experience .............. Implemented for assignments + private notes only; no visibility into student content
Student-Mentor Round Trip ..... FAILED — no code path exists in either direction
Data Persistence ............... Appears sound for pages tested via code review (RLS owner-scoped correctly)
Role Permissions ............... Admin functions correctly server-gated (live-verified); client-side role gate is UI-only but appears backed by RLS
Privacy and Safeguarding ....... Concerning — help requests have no in-app queue, notify function is unauthenticated
Responsive Behaviour ........... Not testable this session
Accessibility Baseline ......... Not testable this session
Error Handling .................. Not assessed live this session
Automated E2E Coverage .......... None exists
Operational Readiness ........... Not ready — no test environment, no CI, one unauthenticated write endpoint
Founder Walkthrough ............. Blocked
Production Confidence ........... Low, specifically for the mentor-student loop and safeguarding path
```

**Recommendation: Repair required before Founder walkthrough.** F-01 (no round-trip path) and F-03/F-04 (safeguarding/help-request gaps) should be resolved first — they're the core acceptance criteria and a real security/safety gap, respectively.

## Open Decisions for the Founder

1. ~~Do you want live account-level testing performed against the shared production Supabase project using synthetic accounts...~~ **ANSWERED 2026-07-25 — yes.** One synthetic student account created via the real signup flow; see "Live Verification — 2026-07-25" above. Full mentor-side walkthrough (assignment + round-trip visibility) still outstanding — needs admin credentials or a connected browser, neither available this session.
2. ~~Should F-04 be live-confirmed...~~ **DONE 2026-07-25.** Both the unauthenticated-401 and authenticated-success-plus-real-email paths were live-tested against the staging deploy; see "Live Verification — 2026-07-25" above.
3. ~~Given F-01, is a mentor→student feedback channel... actually in scope for the current phase...~~ **RESOLVED 2026-07-25 — yes, confirmed in scope, Founder-authorized.** This was never actually ambiguous in the historical record: `docs/assurance/mentorship/PHASE_2_CONTROLLED_PRODUCTION_ROUND_TRIP.md` (2026-07-12) explicitly rated the missing round trip **P1 and launch-blocking** — "this module should not be presented to real mentors/students until F-01 is resolved." The commit that built it (`fa45d8e`) cites that audit by filename as its rationale. The round-trip build was compliance with a pre-existing, Founder-commissioned finding, not unplanned scope expansion. Founder confirmed authorization of this work 2026-07-25.

### Still outstanding (not decisions — just undone cleanup)

- **8 stale synthetic `auth.users` rows** need manual deletion via Supabase Dashboard → Authentication → Users: 7 from the 2026-07-12 audit (`e2e-founder-assurance-20260712-*` and `e2e_v01_verify_20260712*` prefixes — full register in `PHASE_2_CONTROLLED_PRODUCTION_ROUND_TRIP.md`'s "Full synthetic-account register" table, all confirmed zero-data) plus 1 from 2026-07-25 (`inspire.science.uk+claudetest-student-20260725@gmail.com`, see above). None of this Claude session's tooling has service-role access to delete them directly.
