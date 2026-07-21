// Slice 0 — proves the staging project is structurally distinct from
// production, using project identifiers alone (no production access
// performed or required). Run this before trusting any other staging
// script's results.
import { URL, PROJECT_REF, ANON_KEY, assertStaging, listTables } from './lib.mjs';

const PRODUCTION_URL = 'https://ygtsrdwoikqnrbexjrtl.supabase.co';
const PRODUCTION_ANON_KEY_PREFIX = 'sb_publishable_XxmrO4J18iyQ1Srub73BhQ_FBhd8mXR'.slice(0, 20);

(async () => {
  console.log('=== Slice 0 isolation evidence ===\n');
  assertStaging();

  console.log('\n--- Identifier comparison ---');
  console.log('staging URL:      ', URL);
  console.log('production URL:   ', PRODUCTION_URL, '(hardcoded here for comparison only — never called)');
  console.log('URLs distinct:    ', URL !== PRODUCTION_URL ? 'PASS' : 'FAIL');
  console.log('staging ref:      ', PROJECT_REF);
  console.log('refs distinct:    ', PROJECT_REF !== 'ygtsrdwoikqnrbexjrtl' ? 'PASS' : 'FAIL');
  console.log('anon key distinct:', ANON_KEY.slice(0, 20) !== PRODUCTION_ANON_KEY_PREFIX ? 'PASS' : 'FAIL');

  console.log('\n--- Functional check: staging PostgREST responds independently ---');
  const tables = await listTables();
  // Any HTTP response (2xx or otherwise) proves the host is up and
  // PostgREST is answering — a 401 here means "reachable, enforcing
  // auth," not "unreachable." Only a fetch()-level network error (as
  // seen before the URL typo was corrected) means genuinely unreachable.
  console.log('GET /rest/v1/ (mentorship schema root) status:', tables.status, '(server reachable and responding)');

  console.log('\n=== Result ===');
  const allDistinct = URL !== PRODUCTION_URL && PROJECT_REF !== 'ygtsrdwoikqnrbexjrtl' && ANON_KEY.slice(0, 20) !== PRODUCTION_ANON_KEY_PREFIX;
  console.log(allDistinct ? 'PASS — staging is structurally isolated from production by every identifier checked.' : 'FAIL — investigate before proceeding.');
})();
