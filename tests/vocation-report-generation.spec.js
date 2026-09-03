// Coverage for the report pipeline itself: the authenticated report page
// renders cleanly, a failed PDF-engine load degrades to a message instead
// of a silent crash, and — the actual security-relevant case — the public,
// token-gated parent report never contains an unshared mentor observation.
// That last test exercises a different code path than
// vocation-private-vs-shared-notes.spec.js (vocation-parent-report.js's
// service-role assembly, not the mentee's own authenticated RLS reads), so
// it re-derives its own fixture data rather than depending on that file's.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { credsForMentee, credsForMentor, saveLoginState, loginAsAt, mentorAddVocationObservation, functionsBaseUrl } = require('./helpers');

const menteeCreds = credsForMentee();
const mentorCreds = credsForMentor();
const stagingUrl = functionsBaseUrl();
const MENTEE_STATE = path.join(__dirname, '.auth', 'report-mentee.json');

test.describe('Vocation report — authenticated page', () => {
  test.skip(!menteeCreds, 'Requires TEST_MENTEE_EMAIL/TEST_MENTEE_PASSWORD env vars');
  test.use({ storageState: menteeCreds ? MENTEE_STATE : undefined });

  test.beforeAll(async ({ browser }) => {
    if (menteeCreds) await saveLoginState(browser, menteeCreds.email, menteeCreds.password, MENTEE_STATE);
  });

  test('renders every section with no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/mentorship/dashboard/vocation/report.html');
    await expect(page.locator('.r-title')).toBeVisible();
    for (const heading of ['Journey Progress', 'Career Interests', 'Active Pathway Hypotheses', 'Pathway Plan', 'Action Plan', 'Evidence Gathered', 'Notes From Your Mentor']) {
      await expect(page.locator('.r-section-title', { hasText: heading })).toBeVisible();
    }
    expect(errors, `Console/page errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('a failed PDF-engine load shows a failure message, not a crash', async ({ page }) => {
    await page.goto('/mentorship/dashboard/vocation/report.html');
    // html2pdf.js is lazy-loaded from cdnjs only when Download/Email is
    // clicked — abort that specific request to simulate the CDN being
    // unreachable, without touching any other network call the page makes.
    await page.route('**/html2pdf*', (route) => route.abort());

    await page.click('#downloadBtn');
    await expect(page.locator('#downloadBtn')).toHaveText(/failed/i, { timeout: 10000 });
    // And it recovers — the button resets rather than staying stuck.
    await expect(page.locator('#downloadBtn')).toHaveText(/download pdf/i, { timeout: 5000 });
  });
});

test.describe('Vocation report — public parent link', () => {
  const paired = menteeCreds && mentorCreds;
  test.skip(!paired || !stagingUrl, 'Requires TEST_MENTEE_EMAIL/PASSWORD + TEST_MENTOR_EMAIL/PASSWORD (paired via an active mentor_assignments row) AND VOCATION_STAGING_URL — the "Generate Link" button and the parent-report page both call Netlify Functions, which this suite\'s local static webServer does not serve');

  test('the parent-mode report never contains an unshared observation', async ({ page }) => {
    const runId = Date.now();
    const privateNote = `PW REPORTGEN PRIVATE ${runId}`;
    const sharedNote = `PW REPORTGEN SHARED ${runId}`;

    // Every step here uses an absolute staging URL rather than this
    // suite's configured (local, function-less) baseURL — see
    // functionsBaseUrl()'s comment in helpers.js.
    await loginAsAt(page, stagingUrl, mentorCreds.email, mentorCreds.password);
    await mentorAddVocationObservation(page, privateNote, false, stagingUrl);
    await mentorAddVocationObservation(page, sharedNote, true, stagingUrl);

    // signInWithPassword overwrites the stored session directly — see the
    // note in vocation-private-vs-shared-notes.spec.js on why this
    // deliberately skips clicking any sign-out button first.
    await loginAsAt(page, stagingUrl, menteeCreds.email, menteeCreds.password);

    await page.goto(`${stagingUrl}/mentorship/dashboard/vocation/report.html`);
    await page.click('#toggleParentLinkBtn');
    await page.click('#generateLinkBtn');
    await page.locator('#parentLinkBox').waitFor({ state: 'visible', timeout: 15000 });
    const parentUrl = await page.locator('#parentLinkText').textContent();
    expect(parentUrl, 'Generate/Refresh Link should have produced a URL').toBeTruthy();

    await page.goto(parentUrl.trim());
    await expect(page.locator('.report-card')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('body')).toContainText(sharedNote);
    await expect(page.locator('body')).not.toContainText(privateNote);
  });
});
