// Shared helpers for the smoke suite. Kept deliberately small — this is a
// regression net for things that have actually broken before (stubs coming
// back, auth gates failing open, console errors on load), not a full E2E
// framework.

/** Collects console errors + uncaught page errors for a page. Call
 * assertNoErrors() after the actions you want covered. */
function trackConsoleErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return {
    errors,
    assertNoErrors() {
      if (errors.length) {
        throw new Error(`Console/page errors found:\n${errors.join('\n')}`);
      }
    },
  };
}

// ── Vocation & Life Pathways auth fixtures ──────────────────────────────
// Real login through the UI (no mocking, matching this suite's existing
// convention) against seeded TEST_MENTEE_*/TEST_MENTOR_* accounts. These
// accounts don't exist by default — the specs that need them skip
// themselves (via credsFor*() returning null) rather than failing, so
// `npm run test:e2e` still passes for anyone who hasn't set these up.
//
// To enable: create a real mentee and a real approved-mentor account in
// the project's Supabase (mentee should have completed onboarding; for
// the private/shared-notes and report specs, the mentor must have an
// active mentor_assignments pairing with that same mentee), then set
// TEST_MENTEE_EMAIL, TEST_MENTEE_PASSWORD, TEST_MENTOR_EMAIL,
// TEST_MENTOR_PASSWORD (locally via the environment, in CI via repo
// secrets passed through .github/workflows/e2e.yml).

function credsForMentee() {
  const email = process.env.TEST_MENTEE_EMAIL;
  const password = process.env.TEST_MENTEE_PASSWORD;
  return email && password ? { email, password } : null;
}

function credsForMentor() {
  const email = process.env.TEST_MENTOR_EMAIL;
  const password = process.env.TEST_MENTOR_PASSWORD;
  return email && password ? { email, password } : null;
}

// This suite's own webServer (see playwright.config.js) serves the static
// site only, deliberately without Netlify Functions — fine for every
// pre-existing test here, but the parent-link/parent-report flow calls
// /.netlify/functions/vocation-parent-link and vocation-parent-report,
// which 404 against that server (the page's JSON.parse of the 404 HTML
// then throws, landing in the page's own catch block). Rather than a
// misleading always-red test, that coverage requires a real deployment —
// set VOCATION_STAGING_URL (e.g. https://staging.inspirevision.org) to
// run it there; it's skipped otherwise.
function functionsBaseUrl() {
  return process.env.VOCATION_STAGING_URL || null;
}

/** Signs in through the real login form. Redirect target varies by role/
 * onboarding state, so this just waits to leave login.html rather than
 * asserting a specific destination. */
async function loginAs(page, email, password) {
  await page.goto('/mentorship/login.html');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#submitBtn');
  await page.waitForURL((url) => !url.toString().includes('/mentorship/login.html'), { timeout: 15000 });
}

/** Same as loginAs(), but against an explicit absolute origin rather than
 * this suite's configured baseURL — page.goto() with a relative path
 * always resolves against baseURL regardless of what origin the page is
 * currently on, so the functionsBaseUrl() flows (which need every request
 * to land on a real deployment, not the local static server) navigate with
 * fully-qualified URLs throughout instead. */
async function loginAsAt(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/mentorship/login.html`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#submitBtn');
  await page.waitForURL((url) => !url.toString().includes('/mentorship/login.html'), { timeout: 15000 });
}

/** Logs in once in a throwaway context and writes the resulting session to
 * `statePath`, so a spec file's test.use({ storageState: statePath }) can
 * skip the login round-trip for every individual test. Call from
 * test.beforeAll — the file must exist by the time the first test's
 * context is created, not at module-load time, so this ordering is safe. */
async function saveLoginState(browser, email, password, statePath) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, email, password);
  await context.storageState({ path: statePath });
  await context.close();
}

/** Mentor-side helper shared by the private/shared-notes and
 * report-generation specs: opens the first mentee in the mentor's
 * Vocation list and posts one observation. Returns the student id (parsed
 * from the review page's own URL) so the caller can act on that same
 * mentee again without re-deriving it. */
async function mentorAddVocationObservation(page, note, shareWithStudent, baseUrl = '') {
  await page.goto(`${baseUrl}/mentorship/mentor-portal/vocation-mentees.html`);
  const reviewLink = page.locator('a:has-text("Review Journey")').first();
  await reviewLink.waitFor({ timeout: 15000 });
  await reviewLink.click();
  await page.waitForURL('**/vocation-review.html?student=*', { timeout: 15000 });
  const studentId = new URL(page.url()).searchParams.get('student');

  await page.click('button:has-text("Notes & Sharing")');
  await page.fill('#observationNote', note);
  if (shareWithStudent) await page.check('#shareWithStudent');
  await page.click('#addNoteBtn');
  await page.locator('.voc-note-item', { hasText: note }).first().waitFor({ timeout: 10000 });

  return studentId;
}

module.exports = {
  trackConsoleErrors,
  credsForMentee,
  credsForMentor,
  functionsBaseUrl,
  loginAs,
  loginAsAt,
  saveLoginState,
  mentorAddVocationObservation,
};
