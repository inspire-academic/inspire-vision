// Slice 0 — cleanup for seed.mjs's fixed-namespace synthetic accounts.
// Logs in as each account (anon key + the fixed synthetic password —
// see lib.mjs) and deletes only rows it owns, via the same RLS-scoped
// DELETE any real user has. No service-role key used or needed: every
// mentorship table a student can write to, a student can also delete
// their own rows from. The one thing this script cannot do — remove
// the auth.users rows themselves — is reported at the end for manual
// dashboard deletion, exactly like the production leftover-account
// pattern from the V-01 verification.
import { signIn, mentorshipRequest, assertStaging, SYNTHETIC_DOMAIN } from './lib.mjs';

const TAG = 'slice0-seed';
const ACCOUNTS = [
  `${TAG}-student-a@${SYNTHETIC_DOMAIN}`,
  `${TAG}-student-b@${SYNTHETIC_DOMAIN}`,
];
const OWNED_TABLES = ['goals', 'tasks', 'check_ins', 'journal_entries', 'help_requests'];

(async () => {
  console.log('=== Slice 0 reset: deleting owned rows for fixed-namespace synthetic accounts ===\n');
  assertStaging();

  const stillNeedsManualDeletion = [];

  for (const email of ACCOUNTS) {
    const session = await signIn(email);
    if (!session.token) {
      console.log(`\n[skip] Could not sign in as ${email} (status ${session.status}) — may already be cleaned up or never existed.`);
      continue;
    }
    console.log(`\n--- ${email} (${session.id}) ---`);
    stillNeedsManualDeletion.push({ email, id: session.id });

    for (const table of OWNED_TABLES) {
      const ownerField = 'student_id';
      const del = await mentorshipRequest('DELETE', table, session.token, {
        query: `?${ownerField}=eq.${session.id}`,
      });
      console.log(`  DELETE ${table}: status ${del.status}`);
    }

    // Verify empty.
    let allEmpty = true;
    for (const table of OWNED_TABLES) {
      const check = await mentorshipRequest('GET', table, session.token, { query: `?student_id=eq.${session.id}` });
      const rows = Array.isArray(check.body) ? check.body.length : 'n/a';
      if (rows !== 0) allEmpty = false;
      console.log(`  verify ${table}: ${rows} rows remaining`);
    }
    console.log(`  data cleanup: ${allEmpty ? 'CONFIRMED EMPTY' : 'ROWS STILL PRESENT — investigate'}`);
  }

  console.log('\n=== auth.users rows requiring manual dashboard deletion ===');
  if (stillNeedsManualDeletion.length === 0) {
    console.log('None found (no sessions were live) — check the Supabase dashboard directly if unsure.');
  } else {
    for (const acc of stillNeedsManualDeletion) console.log(` - ${acc.email}  (${acc.id})`);
    console.log('\nSupabase Dashboard → Authentication → Users → search "slice0-seed" → delete.');
  }
})();
