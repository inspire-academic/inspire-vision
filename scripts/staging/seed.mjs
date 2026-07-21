// Slice 0 — deterministic synthetic-data seed + safe read/write proof.
// Fixed namespace and fixed password (see lib.mjs) so reset.mjs can log
// back in independently later. Anon key only — every write here is
// exactly what a real signed-up user could do through the product
// itself; nothing here uses or requires a service-role key.
import { signUp, signIn, mentorshipRequest, assertStaging, SYNTHETIC_DOMAIN } from './lib.mjs';

const TAG = 'slice0-seed';
const STUDENT_A = `${TAG}-student-a@${SYNTHETIC_DOMAIN}`;
const STUDENT_B = `${TAG}-student-b@${SYNTHETIC_DOMAIN}`;

const results = [];
function log(name, obj) {
  results.push({ name, ...obj });
  console.log(`\n=== ${name} ===`);
  console.log(JSON.stringify(obj, null, 2));
}

(async () => {
  console.log('=== Slice 0 seed: deterministic synthetic data + safe read/write test ===\n');
  assertStaging();

  // 1. Create two synthetic students (signup returns an immediate
  // session since email confirmation is disabled on staging, matching
  // production's actual behavior per Phase 2).
  const a = await signUp(STUDENT_A);
  log('1. Sign up student A', { email: STUDENT_A, status: a.status, id: a.id });
  const b = await signUp(STUDENT_B);
  log('2. Sign up student B', { email: STUDENT_B, status: b.status, id: b.id });

  if (!a.id || !b.id) {
    console.error('\nSignup failed — aborting. (If this is a re-run, the accounts may already exist: sign-in instead, or check the staging project.)');
    console.log('\nFULL RESULTS:\n', JSON.stringify(results, null, 2));
    process.exit(1);
  }

  // 2. Student A writes one row into each owner-scoped baseline table —
  // proves the full 5-file schema is live and correctly wired, not
  // just that auth works.
  const goal = await mentorshipRequest('POST', 'goals', a.token, {
    body: { student_id: a.id, title: `${TAG} goal`, category: 'personal' },
    prefer: 'return=representation',
  });
  log('3. Student A creates a goal', goal);

  const task = await mentorshipRequest('POST', 'tasks', a.token, {
    body: { student_id: a.id, title: `${TAG} task` },
    prefer: 'return=representation',
  });
  log('4. Student A creates a task', task);

  const checkin = await mentorshipRequest('POST', 'check_ins', a.token, {
    body: { student_id: a.id, mood: 'ok', reflection: `${TAG} check-in` },
    prefer: 'return=representation',
  });
  log('5. Student A creates a check-in', checkin);

  const journal = await mentorshipRequest('POST', 'journal_entries', a.token, {
    body: { student_id: a.id, body: `${TAG} journal entry` },
    prefer: 'return=representation',
  });
  log('6. Student A creates a journal entry', journal);

  const help = await mentorshipRequest('POST', 'help_requests', a.token, {
    body: { student_id: a.id, category: 'general', message: `${TAG} help request` },
    prefer: 'return=representation',
  });
  log('7. Student A creates a help request', help);

  // 3. Student A reads their own goal back — proves read, not just write.
  const ownRead = await mentorshipRequest('GET', 'goals', a.token, { query: `?student_id=eq.${a.id}` });
  log('8. Student A reads own goals (expect 1 row)', ownRead);

  // 4. Safe RLS denial test — student B attempts to read/update/delete
  // student A's goal. This is the "safe" part: it proves isolation
  // *within* staging without ever touching production, and proves the
  // baseline RLS policies are actually enforced in this fresh project,
  // not just present in the SQL that was pasted in.
  const goalId = goal.body?.[0]?.id;
  const crossRead = await mentorshipRequest('GET', 'goals', b.token, { query: `?id=eq.${goalId}` });
  log('9. Student B reads student A\'s goal by ID (expect empty array, RLS-filtered)', crossRead);

  const crossUpdate = await mentorshipRequest('PATCH', 'goals', b.token, {
    query: `?id=eq.${goalId}`,
    body: { title: 'HIJACKED' },
  });
  log('10. Student B attempts to update student A\'s goal (expect 0 rows affected)', crossUpdate);

  const verifyUnchanged = await mentorshipRequest('GET', 'goals', a.token, { query: `?id=eq.${goalId}` });
  log('11. Student A re-reads own goal (expect title unchanged, not "HIJACKED")', verifyUnchanged);

  console.log('\n=== Seed complete ===');
  console.log('Synthetic accounts created this run:');
  console.log(' ', STUDENT_A, a.id);
  console.log(' ', STUDENT_B, b.id);
  console.log('\nRun reset.mjs to clean up owned data. auth.users rows require manual deletion via the Supabase dashboard (no service-role key exists for this project).');

  console.log('\nFULL RESULTS:\n', JSON.stringify(results, null, 2));
})();
