# Follow-up Finding — Spoofable `mentor_status` in admin-matching picker

**Status:** RESOLVED (2026-07-25 verification; fix landed 2026-07-2x per commit history). Logged separately per Founder instruction — out of scope for the `session_notes` RLS fix.

## Resolution

`supabase/mentorship_schema_v5_mentor_applications.sql` added a real
`mentorship.mentor_applications` table — service-role-only status
transitions (no client UPDATE policy; INSERT/SELECT restricted to the
owning mentor's own row). `netlify/functions/admin-matching.js`'s
`list` action now sources its `approvedMentorIds` set from
`mentor_applications.status = 'approved'` instead of
`user_metadata.mentor_status`, exactly per this doc's recommendation.
Code-reviewed 2026-07-25 to confirm the RLS policies and the
picker query match; not re-exploited live (the original finding was
never live-exploited either, per its own Disposition note).

**Source:** Identified during code review while verifying V-01's fix (`supabase/mentorship_schema_v3_fix_session_notes_rls.sql`) does not rely on `user_metadata` for authorization. It doesn't — but this adjacent path does.

## Finding

`netlify/functions/admin-matching.js:50` builds the mentor picker list an admin sees when creating a `mentor_assignments` row by filtering `auth.admin.listUsers()` results on:

```js
.filter(u => u.user_metadata?.mentorship_role === 'mentor' && u.user_metadata?.mentor_status === 'approved')
```

`user_metadata` is client-writable by the account owner via `PUT /auth/v1/user` — proven live in Phase 2 (test 21): a plain student account successfully set `mentorship_role: 'mentor', mentor_status: 'approved'` on itself with a 200 response, no server-side check.

**Consequence:** a self-elevated account could appear in the human admin's picker list as if it were a legitimately-approved mentor, indistinguishable in the UI from a real approval that went through `admin-mentors.js`'s review flow. If the admin trusts the picker and assigns it, a `mentor_assignments` row would be created for an account that was never actually vetted.

## Why this is lower severity than V-01

- Creating the `mentor_assignments` row itself still requires a real admin session (bearer token verified server-side against the `ADMIN_EMAILS` allowlist) — this isn't a path an attacker can trigger unilaterally, unlike V-01 which required no admin action at all.
- It depends on a human admin not cross-checking the name against the actual mentor-application record before assigning — a process/UX gap, not a pure access-control bypass.
- No live exploitation was attempted or is planned for this finding (would require creating a real assignment via the admin UI, which is explicitly reserved for the Founder to perform).

## Recommendation

Have `admin-matching.js`'s picker query the actual mentor-application/approval record (i.e., whatever `admin-mentors.js` treats as source of truth when it sets `mentor_status: 'approved'`) rather than re-reading the same client-writable `user_metadata` field it wrote. If approval status has no independent server-side record beyond `user_metadata` today, that's a prerequisite gap worth its own decision — right now "approved" only ever exists as a value one Netlify function wrote and any authenticated client can overwrite.

## Disposition

Not repaired as part of the V-01 change. Tracked here for prioritization alongside V-02 (`notify-help-request.js` auth) and F-03 (no in-app safeguarding queue) from the Phase 2 report.
