// The core privacy guarantee of mentorship_schema_v21: an unshared mentor
// observation must never reach the mentee, not because the UI happens to
// filter it, but because there is no base-table SELECT policy for a
// student on vocation_mentor_observations at all — the only path a mentee
// can read through is the vocation_observation_recaps view, whose own
// WHERE clause (shared_with_student = true AND student_id = auth.uid())
// is the entire boundary. This test writes one private and one shared
// observation as the mentor, then logs in as the mentee and asserts the
// shared one appears (dashboard + report) while the private one appears
// nowhere in the page.
//
// Requires TEST_MENTOR_* to have an active mentor_assignments pairing with
// TEST_MENTEE_* — same precondition as vocation-report-generation.spec.js's
// parent-report coverage. Without that pairing this suite still runs (both
// creds present) but the mentor's "first mentee in the list" may not be
// the same account as TEST_MENTEE_*, and the shared-note assertions will
// fail — that failure is the signal the pairing needs setting up.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { credsForMentee, credsForMentor, loginAs, mentorAddVocationObservation } = require('./helpers');

const menteeCreds = credsForMentee();
const mentorCreds = credsForMentor();
const paired = menteeCreds && mentorCreds;

test.describe('Vocation — private vs. shared mentor observations', () => {
  test.skip(!paired, 'Requires TEST_MENTEE_EMAIL/PASSWORD and TEST_MENTOR_EMAIL/PASSWORD, paired via an active mentor_assignments row');

  test('a private note stays private; a shared note reaches the mentee\'s dashboard and report', async ({ page }) => {
    const runId = Date.now();
    const privateNote = `PW PRIVATE marker ${runId} — do not show this to the mentee`;
    const sharedNote = `PW SHARED marker ${runId} — visible to the mentee`;

    await loginAs(page, mentorCreds.email, mentorCreds.password);
    await mentorAddVocationObservation(page, privateNote, false);
    await mentorAddVocationObservation(page, sharedNote, true);

    // No explicit sign-out first — every sign-out button in this codebase
    // navigates to the live production marketing site (not a relative
    // path), which would take the test off the server under test entirely.
    // signInWithPassword() below simply overwrites the stored session.
    await loginAs(page, menteeCreds.email, menteeCreds.password);

    await page.goto('/mentorship/dashboard/vocation/index.html');
    await expect(page.locator('#mentorNoteText')).toContainText(sharedNote, { timeout: 15000 });
    await expect(page.locator('body')).not.toContainText(privateNote);

    await page.goto('/mentorship/dashboard/vocation/report.html');
    await expect(page.locator('#reportBody')).toContainText(sharedNote, { timeout: 15000 });
    await expect(page.locator('body')).not.toContainText(privateNote);
  });
});
