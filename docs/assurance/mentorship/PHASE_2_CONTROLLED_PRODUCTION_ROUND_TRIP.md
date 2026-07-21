# Inspire Mentorship — Phase 2: Controlled Production Auth/API/DB/Permission Round-Trip Verification

**This is NOT the complete Founder browser E2E walkthrough.** This session has no browser-automation, console-inspection, or network-inspection capability. This report covers auth, REST API, database (RLS), and serverless-function behavior only, verified directly against the live production Supabase project and Netlify functions using synthetic accounts. The full browser-based Founder walkthrough (visual UX, console errors, click-through, mobile, accessibility) remains mandatory and outstanding — see "Remaining Browser-Only Tests."

Companion document: [`docs/mentorship/FOUNDER-E2E-ROUND-TRIP-REPORT.md`](../../mentorship/FOUNDER-E2E-ROUND-TRIP-REPORT.md) (Phase 1 code-level discovery, produced earlier this session).

**Date:** 2026-07-12 · **Repo:** `C:\Deploy_Inspire_Vision`, branch `main`, commit `38f9a1f` · **Target:** production Supabase project `ygtsrdwoikqnrbexjrtl` and `inspirevision.org` Netlify functions (no isolated test project exists — see Phase 1 report).

## Executive Result

Auth, RLS, and admin-function boundaries are **mostly sound** for the student-facing surface: cross-student IDOR was tested and blocked on every table checked (goals, journal_entries, check_ins, help_requests — reads, writes, and deletes), session persistence across logout/re-login worked correctly, and both admin Netlify functions correctly rejected unauthenticated, invalid-token, and valid-but-non-admin sessions.

**One confirmed, live-exploited critical vulnerability**: `mentorship.session_notes` has no relational integrity check to `mentor_assignments`. **Any authenticated user** — not just an approved mentor, not even a pending mentor applicant, literally any signed-up account — can INSERT a row into `session_notes` for **any student**, by setting `mentor_id` to their own user ID and `student_id` to any UUID they choose. This was proven live: a plain synthetic student account, with no mentor application at all, successfully wrote a "session note" about an unrelated synthetic student it had never interacted with (HTTP 201). Client-side `user_metadata` self-elevation (claiming `mentorship_role: mentor, mentor_status: approved`) was also proven not to affect this — the vulnerability requires no elevation at all, since the RLS policy never checks role or assignment, only self-ownership of the `mentor_id` field.

This compounds the Phase 1 finding (F-01) that no student-facing content is ever visible to mentors and no mentor content is ever visible to students — the one place data *does* flow into `session_notes` has no access control tying it to the actual mentor-student relationship the product is supposed to enforce.

**Verdict: the controlled round-trip test could not be completed as a positive path** (see Stop Condition below) but every boundary/negative-path test that could be run, was run, and surfaced one confirmed P0/P1 vulnerability.

## V-01 Remediation — Applied and Verified (2026-07-12, same day)

**Status: FIXED and live-confirmed.** Following this report's initial circulation, the Founder reviewed and approved a scoped SQL fix, applied it directly via the Supabase SQL Editor, and this session re-ran the exploit live against production to confirm closure. No service-role key or DB connection string was used or requested for this verification pass — everything below was done the same way the original exploit was found: real signup/login, anon key, direct REST calls, no elevated credentials.

### Amended migration

`supabase/mentorship_schema_v3_fix_session_notes_rls.sql` (idempotency amendment added before application — `DROP POLICY IF EXISTS` guards for all four new policy names, so a rerun no longer hard-fails on duplicate policy names):

```diff
 DROP POLICY IF EXISTS "Mentors manage their own session notes" ON mentorship.session_notes;
+DROP POLICY IF EXISTS "Mentors view their own session notes" ON mentorship.session_notes;
+DROP POLICY IF EXISTS "Mentors create session notes for assigned students only" ON mentorship.session_notes;
+DROP POLICY IF EXISTS "Mentors update their own session notes" ON mentorship.session_notes;
+DROP POLICY IF EXISTS "Mentors delete their own session notes" ON mentorship.session_notes;

 CREATE POLICY "Mentors view their own session notes" ... (unchanged)
 CREATE POLICY "Mentors create session notes for assigned students only" ... (unchanged — the EXISTS check against mentor_assignments)
 CREATE POLICY "Mentors update their own session notes" ... (unchanged)
 CREATE POLICY "Mentors delete their own session notes" ... (unchanged)
```

### Application result

Founder ran the migration in the Supabase SQL Editor against production project `ygtsrdwoikqnrbexjrtl`. No errors reported.

### Policy verification (live, Founder-reported from the migration's own confirm query)

```
SELECT polname, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'mentorship' AND tablename = 'session_notes';
```

Returned exactly 4 rows, replacing the single old `FOR ALL` policy:

| Policy | Command |
|---|---|
| Mentors view their own session notes | SELECT |
| Mentors create session notes for assigned students only | INSERT |
| Mentors update their own session notes | UPDATE |
| Mentors delete their own session notes | DELETE |

The old `"Mentors manage their own session notes"` policy is confirmed gone.

### Exploit-after test (this session, live, anon key + real accounts, namespace `e2e_v01_verify_20260712b`)

Same attack proven in the original Phase 2 test (test 19/21): an unassigned account with no mentor application and no `mentor_assignments` row attempts to `INSERT` a `session_notes` row for an unrelated synthetic student, setting `mentor_id` to its own `auth.uid()`.

| # | Test | Before fix (original Phase 2) | After fix (this session) |
|---|---|---|---|
| A | Unassigned account INSERTs `session_notes` for unrelated student | **201** (exploit succeeded) | **403**, `42501 "new row violates row-level security policy for table session_notes"` |
| B | Same, unauthenticated (anon key only, no session) | (not separately tested in Phase 2; RLS already blocked anon generally) | **401** — denied before even reaching the policy check |
| C | Attacker self-elevates `user_metadata` to `mentorship_role: mentor, mentor_status: approved`, retries the same INSERT | **201** (self-elevation proven irrelevant — bug was never metadata-gated) | **403**, identical error — confirms the new policy still ignores `user_metadata` entirely, exactly as designed |
| D | Victim student SELECTs `session_notes` where `student_id = self` | `[]` (no student-read policy — F-01, unchanged) | `[]` — **unchanged, as expected**; this fix does not add student visibility, see Residual Risks |
| E | Zero `session_notes` rows exist after the run | N/A | Confirmed via fresh authenticated read — **no rows were created at any point in this test**, nothing to delete |

**V-01 is confirmed closed.** The exact reproduction steps that produced a live `201` in the original Phase 2 test now produce a `403` under the same conditions, same accounts pattern, same headers, same anon key.

### Tests passed this pass

- Exploit-after (A): blocked, as intended.
- Anon/unauthenticated variant (B): blocked.
- Self-elevated metadata variant (C): blocked — proves the fix's safety doesn't depend on `user_metadata` being untrustworthy by luck; it never reads it at all.
- Student read-own-notes (D): unchanged (by design, not a regression).
- Zero data leakage / zero orphaned rows (E): confirmed.

### Tests still blocked

- **Positive assigned-mentor path** (originally steps 16, 18, 22-29 in this report): still requires a real `mentor_assignments` row, which can only be created via `admin-matching.js` under a genuine admin session. Per Founder instruction, no assignment was manufactured directly in the database for this verification — **this remains a Founder-performed step via the real admin UI.** Marked **PENDING**, not failed.
- Consequently, also still blocked: confirming a mentor retains SELECT/UPDATE/DELETE on a note written while an assignment was active, after that assignment later ends (the behavior the fix's comment says it preserves) — this needs a real note to exist first, which needs the positive path above.
- Full closed-loop lifecycle (student content → mentor → response → student) — unchanged from original Phase 2 finding (F-01): no code path exists for this in either direction, and this fix does not add one (it only adds an integrity check on who may write, not any new visibility).
- Full browser-based Founder walkthrough (visual, console, mobile, accessibility) — unchanged, still entirely outstanding, unrelated to this fix.

### Residual risks (unchanged or newly logged, not addressed by this fix)

- **F-01 stands**: mentors still cannot see student-authored content, and students still cannot see session notes at all, even from a properly assigned mentor. This fix closes the integrity hole on *who* can write a note; it does not open the visibility the product's round-trip acceptance criterion requires.
- **New follow-up finding logged separately** (not repaired here, per Founder instruction): `admin-matching.js`'s mentor picker filters on client-writable `user_metadata.mentor_status`, so a self-elevated account could appear in the admin's picker list as if genuinely approved. See [`FOLLOWUP-mentor-status-spoofable-picker.md`](FOLLOWUP-mentor-status-spoofable-picker.md). Lower severity than V-01: still requires a real admin session to act on, and is a process/UX gap rather than a direct bypass.
- V-02 (`notify-help-request.js` unauthenticated) and F-03 (no in-app safeguarding queue) are both unchanged and still open.

### Cleanup — synthetic accounts from this verification pass

No `mentorship.*` data rows were created (all insert attempts were correctly rejected before any row landed), so there is nothing to delete at the data layer. `auth.users` shells remain and require `service_role` to delete (same constraint as original Phase 2 — no service-role key available in this session):

| Role | Email | User ID |
|---|---|---|
| Victim (attempt 1, aborted on a header/schema issue on my end before reaching RLS — zero data touched) | `e2e_v01_verify_20260712-victim@example.com` | `cd5e3167-7178-4af7-82c5-55f37a310a90` |
| Attacker (attempt 1, same) | `e2e_v01_verify_20260712-attacker@example.com` | `d2eeebb6-a3a5-460c-9b6d-3d1aa74f4082` |
| Victim (successful verification run) | `e2e_v01_verify_20260712b-victim@example.com` | `f7acd795-aec8-4c81-8462-61046c914542` |
| Attacker (successful verification run) | `e2e_v01_verify_20260712b-attacker@example.com` | `3bc15b53-53f0-41f0-a21f-2694940b8492` |

These 4, plus the 3 already flagged at the end of the original Phase 2 report (`e2e-founder-assurance-20260712-*`), makes **7 total inert synthetic `auth.users` rows** awaiting a Supabase dashboard deletion pass (Authentication → Users → search each `e2e` prefix). All 7 are confirmed to have zero linked data in any `mentorship.*` table.

### Deletion capability check (2026-07-12, later same day)

Checked whether the 7 leftover `auth.users` rows below could be deleted through an existing authenticated pathway the application itself already uses, without obtaining or exposing a service-role credential. Result: **no such pathway exists and none was created.** Both admin Netlify functions (`admin-mentors.js`, `admin-matching.js`) only `listUsers`/`getUserById`/`updateUserById` — neither exposes a delete-user action — and using `auth.admin.deleteUser` directly requires the service-role key, which remains absent from this environment by design (see Stop Condition above). No `netlify link`, credential fetch, or password-reset flow was attempted. Deletion is left to the Founder via the Supabase dashboard.

### Full synthetic-account register — safe for manual deletion

| # | Role | Email | UUID | Zero-rows basis |
|---|---|---|---|---|
| 1 | Student (Phase 2) | `e2e-founder-assurance-20260712-student1@example.com` | `9089e08c-c285-47c4-a982-00e5134242d0` | Documented in original Phase 2 Cleanup Evidence — deleted + fresh-read-confirmed at the time |
| 2 | Student (Phase 2) | `e2e-founder-assurance-20260712-student2@example.com` | `77124df6-0dde-4c70-8b01-02140e19acde` | Same as above |
| 3 | Mentor (Phase 2) | `e2e-founder-assurance-20260712-mentor1@example.com` | `20a8d9b1-11bf-4a10-a63e-590c99095f77` | Same as above |
| 4 | Victim (V-01 verify, aborted run) | `e2e_v01_verify_20260712-victim@example.com` | `cd5e3167-7178-4af7-82c5-55f37a310a90` | This session's complete audit trail: signup only, no other endpoint ever called under this identity |
| 5 | Attacker (V-01 verify, aborted run) | `e2e_v01_verify_20260712-attacker@example.com` | `d2eeebb6-a3a5-460c-9b6d-3d1aa74f4082` | Same as above |
| 6 | Victim (V-01 verify, successful run) | `e2e_v01_verify_20260712b-victim@example.com` | `f7acd795-aec8-4c81-8462-61046c914542` | This session's complete audit trail: signup + one SELECT (empty) under this identity, no write ever succeeded |
| 7 | Attacker (V-01 verify, successful run) | `e2e_v01_verify_20260712b-attacker@example.com` | `3bc15b53-53f0-41f0-a21f-2694940b8492` | This session's complete audit trail: signup + metadata self-elevation + 3 `session_notes` INSERT attempts, all 403/401, no row ever created; final SELECT confirmed empty |

**Verified zero rows across all 8 `mentorship.*` tables** (`goals`, `sessions`, `tasks`, `check_ins`, `journal_entries`, `help_requests`, `mentor_assignments`, `session_notes`) for all 7 UUIDs above, by table:

- `mentor_assignments`: zero for all 7 — no assignment was ever successfully created for anyone in either session (the Stop Condition in both passes), and creation requires an admin session never used against these accounts.
- `session_notes`: zero for all 7 — Phase 2's 2 rows were deleted and fresh-read-confirmed; this session's 3 INSERT attempts all failed before any row was created (403/401, confirmed via the final empty SELECT in this session's log).
- `goals`, `tasks`, `check_ins`, `journal_entries`, `help_requests`: zero for accounts 4-7 (no product or API call under their identity ever touched these tables — the only actions taken were signup, metadata self-elevation, and `session_notes` inserts); zero for accounts 1-3 per Phase 2's documented deletion of exactly one row per table for student1, fresh-read-confirmed at the time.
- `sessions`: zero for all 7 — this table has no INSERT code path anywhere in the product or in either testing session (F-01), so it was never written to by any of these accounts.
- No `profiles` table exists in this schema — role/status lives only in `auth.users.user_metadata`, which is deleted automatically when the `auth.users` row itself is deleted (no separate cleanup needed there).

**All 7 accounts: confirmed safe for manual deletion from Supabase Authentication.** No new privileges were sought or created to perform this check.

---

## Scope and Limitations

- No browser was used. All tests are direct HTTPS calls (`curl`) to Supabase Auth, PostgREST, and Netlify Functions, using the same public anon key the production frontend uses (`assets/supabase.js`), plus session tokens obtained through the real signup/login endpoints — i.e., anything a real browser client could do, done without a browser.
- **Stop Condition hit and not resolved**: creating a `mentorship.mentor_assignments` row (the one write gated to `service_role`/admin-only, correctly — see Confirmed Vulnerabilities, this is *not* a gap) requires either the raw `SUPABASE_SERVICE_ROLE_KEY` (not present in this session/environment — confirmed absent) or a real admin session (no admin credentials available to this session). Per your instruction, I did not seek out the service-role key. This blocked the **positive** "mentor sees their assigned student" path and the full closed-loop lifecycle (student action → mentor review → mentor response → student sees response). Everything else in the brief that doesn't require that one write was completed.
- `notify-help-request.js` was **not invoked with POST**. Its recipient (`HELP_REQUEST_NOTIFY_EMAIL`) is a fixed server env var I cannot see or redirect, there is no dry-run mode, and a 200 response doesn't distinguish "sent" from "not sent" (see source, quoted in Serverless-Function Findings). No safe controlled recipient exists, so per your instruction this was left as a code-level finding only, not live-confirmed.
- All 3 synthetic `auth.users` accounts still exist (auth-layer only — zero data rows remain). Deleting them requires `service_role`; see Cleanup.

## Safety Protocol (as executed)

- Synthetic namespace used throughout: `e2e_founder_assurance_20260712` (in emails and in every free-text field written).
- No real user, student, mentor, parent, or administrator record was read, filtered near, or touched at any point — every query was scoped by a synthetic UUID this session created.
- No migration, schema change, deployment, commit, or push occurred.
- No email was sent to any real recipient.
- Test account passwords are recorded only in this session's local scratchpad (not committed, not in this report).

## Synthetic Data Register

| Role | Email | User ID | Purpose |
|---|---|---|---|
| Student | `e2e-founder-assurance-20260712-student1@example.com` | `9089e08c-c285-47c4-a982-00e5134242d0` | Primary lifecycle test subject |
| Student | `e2e-founder-assurance-20260712-student2@example.com` | `77124df6-0dde-4c70-8b01-02140e19acde` | Cross-student isolation/IDOR target |
| Mentor | `e2e-founder-assurance-20260712-mentor1@example.com` | `20a8d9b1-11bf-4a10-a63e-590c99095f77` | Mentor-side boundary tests (never approved, never assigned) |

No `mentor_assignments` row was ever successfully created (see Stop Condition) — student1/mentor1 were never actually linked by the product's intended mechanism at any point in this test.

## Lifecycle Test Results

Classification per your requirement: **Product** (real UI-equivalent flow) / **API** (RLS permits it but no UI exposes it) / **DB-setup** (bypasses intended flow) / **Missing** (no path exists at all).

### Student lifecycle

| # | Test | Classification | Result |
|---|---|---|---|
| 1-2 | Create + authenticate synthetic student | Product | PASS — `POST /auth/v1/signup` returned an immediate session; **no email confirmation is required by this project** (contrary to what `join.html`'s "check your email" messaging implies — see Institutional Gaps) |
| 3 | Unauthenticated access rejected | Product/RLS | PASS — anon reads on all 8 tables return `200 []` (RLS-filtered, not exposed); anon INSERT attempts are RLS-denied (verified in Phase 1) |
| 4 | Onboarding data | Product (partial) | Onboarding steps 2-4 (`know-me`, `strengths`, `life-wheel`) write to `user_metadata`, not a table — not independently re-tested here since Phase 1 code review already confirmed this write path is identical to the self-elevation write path proven to work (test #21 below) |
| 5 | Create goal | Product | PASS — `POST .../goals` → 201, correct row shape |
| 6 | Create task | **API only — no product path exists.** Grep-confirmed zero insert call anywhere in `mentorship/`. | PASS at API level (RLS permits owner insert); **the product itself has no "add a task" UI** |
| 7 | Create reflection (journal) | Product | PASS — `POST .../journal_entries` → 201 (after correcting to actual schema: `body`, not `content`) |
| 7b | Check-in | Product | PASS — `POST .../check_ins` → 201 (after correcting to actual schema: `reflection`, not `note`) |
| 8 | Create help request, no mail sent | Product (DB layer) | PASS — `POST .../help_requests` → 201; confirmed the client insert and the notify-function call are two separate client-side steps, so the DB row was created with zero email risk |
| 9-10 | Sign out / re-authenticate | Product | Sign-out (`/auth/v1/logout?scope=global`) → 204. **Note:** the prior access token remained valid for reads until natural JWT expiry — this is standard Supabase/JWT behavior (logout revokes the refresh token, not an already-issued short-lived access token), not an app bug, but worth knowing precisely what "logout" guarantees. Re-authentication via password login succeeded and issued a fresh token. |
| 11-12 | Persistence + own-record read | Product | PASS — all 5 records (goal, task, journal, check-in, help request) read back correctly under the new post-relogin session |
| 13 | Cannot read/modify another user's records | Product/RLS | PASS on every table tested — student2 reading student1's goal/journal/check-in/help-request by exact ID all returned `[]`; student2's PATCH and DELETE against student1's goal both matched zero rows (verified via a fresh read as student1 showing the record completely unchanged) |
| 14 | Cannot perform mentor-only actions | Product/RLS | PASS — student1 INSERT into `mentor_assignments` → `403 42501 RLS violation`; student1 INSERT into `session_notes` (as mentor_id=mentor1, i.e. impersonating the mentor) → `403 42501 RLS violation` |

### Mentor lifecycle

| # | Test | Classification | Result |
|---|---|---|---|
| 15 | Authenticate as mentor | Product | PASS |
| 16 | Mentor sees assigned student | Product | **NOT TESTABLE — blocked by Stop Condition** (no assignment could be created without service-role/admin session) |
| 17 | Mentor cannot see unassigned student | Product/RLS | PASS for `goals`/`journal_entries`/`help_requests` — mentor1 (never assigned to anyone) reading student1's rows on all three tables returned `[]` |
| 18 | Review assigned student's goals/plans/reflections/help-request | Product | **NOT TESTABLE as a positive path** (no assignment). But answered definitively at the code level in Phase 1 and reconfirmed here: **no mentor-portal page anywhere queries `goals`, `journal_entries`, `check_ins`, `tasks`, or `help_requests` — this capability does not exist in the product regardless of assignment status.** |
| 19 | Add mentor response/session note via real workflow | Product (nominally), **actually API/DB-integrity-free** | **This is the critical finding.** mentor1 — unapproved, unassigned — successfully `POST .../session_notes` → **201**, targeting student1, with no assignment ever existing. This is not the "real supported workflow" (the UI checks for an assignment client-side first) but the database itself does not enforce it — see Confirmed Vulnerabilities. |
| 20 | Mentor cannot alter student-owned info beyond intended model | Product/RLS | PASS — mentor1 was never tested able to write to `goals`/`journal_entries`/`check_ins`/`help_requests`/`tasks` (no policy grants a non-owner any access; not separately re-probed for write since read was already denied) |
| 21 | Client-controlled `user_metadata` cannot obtain real access | Product/RLS | PASS with an important nuance — see below |

**Test 21 in detail:** student1 called `PUT /auth/v1/user` with `{"data":{"mentorship_role":"mentor","mentor_status":"approved"}}` → **200, accepted**, exactly as Phase 1 predicted (metadata is self-writable). Consequences checked:
- Reading `mentor_assignments` as the now-self-declared "mentor": still `[]` — correct, RLS keys off `auth.uid()` actually appearing as a `mentor_id` somewhere, not off metadata.
- **Writing `session_notes` as the self-declared "mentor," targeting student2 (a total stranger): `201`.** This succeeded — but critically, it would have succeeded identically *without* the self-elevation step, since the RLS policy never inspects `mentorship_role`/`mentor_status` at all. The self-elevation is a red herring for this particular hole; the real bug is that `session_notes` has no ownership check beyond "the caller set `mentor_id` to themselves."
- Both `admin-mentors` and `admin-matching`, called with this self-elevated "approved mentor" token: **403 "Not authorized"** on both — confirmed the admin gate is genuinely server-side (`ADMIN_EMAILS` allowlist check against the verified token's real email), completely ignoring client-supplied metadata. This part of the system is solid.

### Closed-loop lifecycle (steps 22-29)

**Not testable.** All require a real `mentor_assignments` row (Stop Condition) and, per Phase 1's code-confirmed finding, several require a mentor→student visibility path that doesn't exist in the product at all (steps 23, 26 assume the student/mentor can see each other's contributions — no such path exists for goals/journal/check-ins/help-requests in either direction, and `session_notes` specifically has no student-read policy even when a legitimate assignment exists). Marked **Missing workflow**, not "untested."

## Permission Matrix

Denial source key: **RLS** = Postgres row-level security (database-enforced) · **App** = Netlify function server-side check · **Client** = UI-only, not verified here.

| Actor | Own records | Assigned student's records | Unassigned student's records | Mentor-only actions | Admin functions |
|---|---|---|---|---|---|
| Anonymous | N/A | N/A | Denied — RLS (empty reads, verified Phase 1) | Denied — RLS | Denied — App (401 missing auth header) |
| Student | **Allowed** — full CRUD verified (goals/tasks/journal/check-ins/help-requests) | N/A (students don't have "assigned" mentors in a way that grants extra access) | Denied — RLS (read/write/delete all tested, all blocked) | Denied — RLS (`mentor_assignments`, `session_notes` INSERT both 403) | Denied — App (403, even with self-claimed "approved mentor" metadata) |
| Mentor (unapproved/unassigned) | **Allowed** — own `session_notes` only, but **`session_notes` write is NOT scoped to actual assignment — see vulnerability** | N/A — no assignment existed to test the *intended-positive* path | Denied for goals/journal/help_requests (RLS) — **but NOT denied for `session_notes` INSERT (this is the bug)** | `mentor_assignments` INSERT denied — RLS (service-role only, correct) | Denied — App (403) |

## Persistence Evidence

Every write was followed by a fresh, independently-authenticated read (a new HTTP request, not a cached client state) before being counted as verified — per your instruction not to infer success from a 200 alone:
- Goal, task, journal entry, check-in, help request: all 5 confirmed present via fresh read **after** a full sign-out + password re-login cycle (new access token, new session).
- The one case where a write returned a "success-shaped" response but nothing actually changed: student2's PATCH/DELETE against student1's goal both returned HTTP 200/204 (PostgREST's normal response for "zero rows matched the filter," not an error) — the fresh read as student1 immediately after showed the record byte-for-byte unchanged (`updated_at` timestamp identical to the original insert). This is exactly the kind of result your evidence standard was designed to catch.

## Serverless-Function Findings

- `admin-mentors`, `admin-matching`: consistently and correctly rejected (a) no auth header → 401, (b) garbage/invalid token → 401, (c) valid session but non-admin email → 403, across every variant tested. No weakness found in either function's authorization layer.
- `notify-help-request.js` (source re-read in full this session): confirmed no auth/session check of any kind exists in the code — it will process any POST with a `message` field from anyone. Additional issues visible in source not previously called out: **the function returns HTTP 200 even when the email fails to send or isn't configured at all** (`{sent:false}` inside a 200 — lines 30, 88 of the file), meaning neither a caller nor a monitoring system can distinguish success from failure by status code alone; and `studentName`/`studentEmail` are fully caller-controlled free text with no cross-check against the actual authenticated session, so the alert email's "From: [name] ([email])" line could be populated with anything the caller sends, regardless of who (if anyone) is actually logged in.

## Confirmed Vulnerabilities

### V-01 — CRITICAL (P0/P1): `session_notes` has no relational integrity to `mentor_assignments`
**Confidence: CONFIRMED (live-exploited).** Any authenticated user — proven with both an unapproved/unassigned mentor applicant and a plain student account with no mentor application at all — can `INSERT` into `mentorship.session_notes` for any `student_id` of their choosing, by setting `mentor_id` to their own `auth.uid()`. The RLS policy (`FOR ALL ... USING/WITH CHECK (auth.uid() = mentor_id)`) never checks that a corresponding `mentor_assignments` row exists, never checks `mentor_status = 'approved'`, and never checks `mentorship_role` at all.
**Reproduction:** `POST /rest/v1/session_notes` with a valid session JWT, body `{"student_id": "<any UUID>", "mentor_id": "<caller's own auth.uid()>", "note": "..."}` → `201`.
**Impact:** Any signed-up user (not even required to apply as a mentor) can write persistent, mentor-attributed notes about any student in the system, including students they have no relationship with. Since `session_notes` has no student-read policy, students can't see or contest this, and there's no audit surface for it in the (stub) admin pages.
**Likely cause:** `mentorship_schema_v3.sql`'s `session_notes` policy checks only self-ownership of `mentor_id`, omitting a join/`EXISTS` check against `mentor_assignments`.
**Recommendation:** Add `AND EXISTS (SELECT 1 FROM mentorship.mentor_assignments a WHERE a.mentor_id = auth.uid() AND a.student_id = session_notes.student_id AND a.status = 'active')` to the `WITH CHECK` (and ideally `USING`) clause of the RLS policy.

### V-02 — HIGH (P1): `notify-help-request.js` unauthenticated + non-verifiable delivery
**Confidence: CONFIRMED at code level; live POST not performed (no safe recipient — see Scope).**
**Recommendation:** add a session check (reuse `_lib/adminAuth.js`'s token-verification half without the allowlist, i.e. "must be a valid authenticated user," and derive `studentName`/`studentEmail` server-side from the verified token rather than trusting the request body); make failures distinguishable from successes in the response.

### V-03 — INFORMATIONAL (P3): client-writable role metadata
**Confidence: CONFIRMED, but proven low-impact.** Self-elevation via `updateUser` is trivially possible from any browser console, but every actual access decision tested (RLS on 7 tables, both admin functions) ignores this metadata entirely and checks real ownership/allowlist instead. Not a vulnerability in itself; flagged only because V-01 means the *appearance* of mentor status could mislead a casual reviewer into thinking approval matters more than it does for `session_notes` specifically.

## Institutional Workflow Gaps (confirmed/reconfirmed live)

- No signup email confirmation is actually required by this Supabase project, despite `join.html` telling users to "check your email" — a cosmetic/trust mismatch worth a product decision (Phase 1 also flagged the reverse concern that confirmation might block testing; empirically it doesn't).
- "Create a task" has no product-facing entry point at all (Phase 1 flagged this from code; now doubly confirmed — I had to hand-craft the request since no page does it).
- The mentor-student round trip (Phase 1's F-01) remains structurally absent, and V-01 shows the one place mentor-authored content *can* be written has no integrity control tying it to a real relationship — i.e., not only is the intended round trip missing, the one existing write surface is also unsafe.

## Cleanup Evidence

All `mentorship.*` rows created during this session (2 goals-adjacent inserts corrected after schema mismatches don't count as extra rows — the failed 400 requests created nothing) were deleted and independently re-verified as absent via fresh authenticated reads, per table, per synthetic account — see full table-by-table `[]` results captured live in this session. Deleted: 1 goal, 1 task, 1 journal entry, 1 check-in, 1 help request (student1); 2 session_notes rows (one by mentor1, one by self-elevated student1). **Zero synthetic data rows remain in any `mentorship.*` table.**

**Not cleaned up — flagged precisely, not silently left:** the 3 `auth.users` rows themselves. Deleting an auth user requires `auth.admin.deleteUser`, which requires `service_role`, unavailable to this session (this is the same Stop Condition as assignment creation). These 3 accounts are inert (zero linked data anywhere) but still exist:
- `9089e08c-c285-47c4-a982-00e5134242d0` — student1
- `77124df6-0dde-4c70-8b01-02140e19acde` — student2
- `20a8d9b1-11bf-4a10-a63e-590c99095f77` — mentor1

Recommend deleting these 3 via the Supabase Auth dashboard (Authentication → Users → search `e2e-founder-assurance-20260712`), or let me know if you'd rather I use a different mechanism.

## Remaining Browser-Only Tests

Everything listed as "NOT TESTABLE THIS SESSION" in the Phase 1 report still applies: visual click-through, console/network inspection, mobile/tablet/desktop layout, accessibility, and — now also — a live in-browser reproduction of V-01 (confirming the mentor-portal UI's client-side assignment check is the *only* thing currently standing between a casual user and writing notes on arbitrary students).

## Production Readiness Impact

**Update 2026-07-12, same day: V-01 is now patched and live-verified closed** (see remediation section above) — the specific live vulnerability described below no longer reproduces. The original finding is preserved unedited below for the record.

V-01 was a real, live vulnerability in production, not a hypothetical — any person who signs up (mentor application not even required) could write persistent notes attributed to themselves-as-mentor about any student by UUID, and there was no admin surface to detect this happening (`admin/mentees.html`, `admin/reports.html`, `admin/safeguarding.html` are all still stubs). Combined with F-01 from Phase 1 (no working round trip, **still open**), this module should not be presented to real mentors/students until F-01 is resolved and the remaining P1 items (V-02, F-03) are addressed — it directly touches child-safeguarding-adjacent data (session notes about a young person), and V-01's closure removes one integrity risk but does not by itself make the mentor-student loop functional or the safeguarding path complete.

## Prioritised Findings

| ID | Title | Severity | Confidence |
|---|---|---|---|
| V-01 | Any authenticated user can write `session_notes` for any student — no assignment check in RLS | ~~**P0**~~ **FIXED 2026-07-12** | CONFIRMED closed — live exploit re-tested and blocked, see remediation section above |
| F-01 (Phase 1) | No code path exists for mentor↔student content visibility in either direction; `sessions` table is write-dead | **P1** | CONFIRMED, still open — not in scope of the V-01 fix |
| V-02 | `notify-help-request.js` unauthenticated, non-verifiable delivery status | **P1** | CONFIRMED (code), delivery behavior untested live |
| F-03 (Phase 1) | No in-app safeguarding queue for help requests; only an unauthenticated email side-channel | **P1** | CONFIRMED |
| — | `admin-matching.js` mentor picker trusts client-writable `user_metadata.mentor_status` | **P2** | CONFIRMED (code), new — see [follow-up finding](FOLLOWUP-mentor-status-spoofable-picker.md) |
| — | "Create a task" has no product UI path | **P2** | CONFIRMED |
| V-03 | Client-writable role metadata (proven not to grant real access on its own) | **P3** | CONFIRMED, low impact |
| — | Signup "check your email" messaging doesn't match actual (no-confirmation-required) behavior | **P3** | CONFIRMED |

## Open Decisions for the Founder

1. ~~**V-01 fix**~~ **DONE 2026-07-12** — applied and live-verified, see remediation section above.
2. Deleting the now-7 leftover synthetic `auth.users` rows (3 from original Phase 2 + 4 from this pass's verification) — via your Supabase dashboard (Authentication → Users → search each `e2e` prefix listed in the Cleanup sections), or tell me how you'd like it handled.
3. Whether to complete the positive-path mentor/assignment tests (steps 16, 18, 22-29, still PENDING) — needs you to perform a real assignment via the admin-matching UI (fresh synthetic pair recommended, since the ones above are slated for deletion), plus the full browser-based Founder walkthrough this Phase 2 pass explicitly does not cover.
4. Prioritization of the remaining open items: F-01 (round-trip visibility, P1), V-02 (`notify-help-request.js` auth, P1), F-03 (no safeguarding queue, P1), and the new `admin-matching.js` picker follow-up (P2).
