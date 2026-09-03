// Security-boundary coverage for Vocation & Life Pathways: the stage-machine
// trigger, the parent-token gate, and mentor/mentee cross-isolation. Each
// test here is deliberately self-sufficient — no fixture pairing required —
// so it stays runnable even before a real seeded mentor/mentee pair exists.
// See vocation-private-vs-shared-notes.spec.js for the paired-account
// coverage this file doesn't attempt.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { credsForMentee, credsForMentor, saveLoginState, functionsBaseUrl } = require('./helpers');

const menteeCreds = credsForMentee();
const mentorCreds = credsForMentor();
const stagingUrl = functionsBaseUrl();
const MENTEE_STATE = path.join(__dirname, '.auth', 'permissions-mentee.json');
const MENTOR_STATE = path.join(__dirname, '.auth', 'permissions-mentor.json');

test.describe('Vocation permissions — stage-machine trigger', () => {
  test.skip(!menteeCreds, 'Requires TEST_MENTEE_EMAIL/TEST_MENTEE_PASSWORD env vars');
  test.use({ storageState: menteeCreds ? MENTEE_STATE : undefined });

  test.beforeAll(async ({ browser }) => {
    if (menteeCreds) await saveLoginState(browser, menteeCreds.email, menteeCreds.password, MENTEE_STATE);
  });

  test('a mentee cannot set their own stage status to "complete" directly', async ({ page }) => {
    // vocation_enforce_stage_transition() (mentorship_schema_v18) only lets
    // the assigned MENTOR move a row to mentor_reviewed/complete — a mentee
    // calling the same update directly (bypassing the UI, which never even
    // offers this) must be rejected by the trigger, not just hidden by the
    // client. Uses the page's own already-authenticated Supabase client
    // (assets/supabase.js's getDB()) rather than a second, separately
    // configured client.
    await page.goto('/mentorship/dashboard/vocation/discover.html');
    await page.waitForLoadState('networkidle');

    const errorMessage = await page.evaluate(async () => {
      const db = await getDB();
      const { data: { user } } = await db.auth.getUser();
      const { error } = await db.schema('mentorship').from('vocation_stage_progress')
        .update({ status: 'complete' })
        .eq('student_id', user.id)
        .eq('stage', 'discover');
      return error ? error.message : null;
    });

    expect(errorMessage, 'Direct client update to status=complete should be rejected by the trigger').toBeTruthy();
  });
});

test.describe('Vocation permissions — parent report token gate', () => {
  test('a nonexistent parent token is rejected, not silently served', async ({ page }) => {
    // Needs vocation-parent-report.js actually running — this suite's own
    // webServer serves static files only (see functionsBaseUrl()'s comment
    // in helpers.js), so this specifically requires a deployment.
    test.skip(!stagingUrl, 'Requires VOCATION_STAGING_URL (Netlify Functions are not served locally)');
    await page.goto(`${stagingUrl}/mentorship/parent-report.html?token=0000000000000000000000000000000000000000000000`);
    await expect(page.locator('.state-card h1')).toHaveText(/could not load report/i, { timeout: 15000 });
  });

  test('a missing token shows a clear message instead of loading forever', async ({ page }) => {
    // No function call on this path (checked client-side before any
    // fetch), so this one runs fine against the local static server.
    await page.goto('/mentorship/parent-report.html');
    await expect(page.locator('.state-card h1')).toHaveText(/missing report link/i);
  });
});

test.describe('Vocation permissions — mentor cross-isolation', () => {
  test.skip(!mentorCreds, 'Requires TEST_MENTOR_EMAIL/TEST_MENTOR_PASSWORD env vars');
  test.use({ storageState: mentorCreds ? MENTOR_STATE : undefined });

  test.beforeAll(async ({ browser }) => {
    if (mentorCreds) await saveLoginState(browser, mentorCreds.email, mentorCreds.password, MENTOR_STATE);
  });

  test('a mentor cannot review a student who is not their active mentee', async ({ page }) => {
    // Fabricated, well-formed but almost certainly unassigned UUID — no
    // need to know a real unassigned student's id. mentor_assignments'
    // own EXISTS-based RLS is the actual boundary; this just confirms the
    // page surfaces that as a clear message rather than an empty/broken page.
    await page.goto('/mentorship/mentor-portal/vocation-review.html?student=00000000-0000-4000-8000-000000000000');
    await expect(page.locator('body')).toContainText(/not your mentee|isn't currently assigned to you/i, { timeout: 15000 });
  });
});
