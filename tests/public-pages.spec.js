// Regression guard for the public-facing pages built out across several
// sessions (mentorship/index.html, parents.html, philosophy.html were each
// a 22-line "coming soon" stub before) — the specific failure mode this
// protects against is one of them silently reverting to that stub, or a
// bad edit introducing a JS error that breaks the page for real visitors.
const { test, expect } = require('@playwright/test');
const { trackConsoleErrors } = require('./helpers');

test.describe('Homepage', () => {
  test('loads with hero and programme flyer carousel, no console errors', async ({ page }) => {
    const tracker = trackConsoleErrors(page);
    await page.goto('/index.html');
    await expect(page.locator('.hero h1')).toBeVisible();
    await expect(page.locator('#flyer-carousel')).toBeVisible();
    // Give the flyers.json fetch + first render a moment to complete.
    await expect(page.locator('.flyer-slide').first()).toBeVisible({ timeout: 5000 });
    tracker.assertNoErrors();
  });
});

test.describe('Mentorship public pages — must not be the coming-soon stub', () => {
  const pages = [
    { path: '/mentorship/index.html', mustContain: 'Become a Mentee' },
    { path: '/mentorship/parents.html', mustContain: 'Enroll Your Child' },
    { path: '/mentorship/philosophy.html', mustContain: 'Whole-Person Growth' },
  ];

  for (const { path, mustContain } of pages) {
    test(`${path} has real content, no console errors`, async ({ page }) => {
      const tracker = trackConsoleErrors(page);
      await page.goto(path);
      await expect(page.locator('body')).not.toContainText('Coming soon — this section is being built.');
      await expect(page.locator('body')).toContainText(mustContain);
      tracker.assertNoErrors();
    });
  }
});

test.describe('Visitor preview — no redirect, real content, sign-in prompt', () => {
  // Regression target: journey.html, resources.html, and stories.html
  // used to hard-redirect an anonymous visitor straight to login.html
  // (like every other private page in auth-gating.spec.js). The 2026-09
  // experience audit changed that deliberately — an anonymous visitor
  // should see honest, non-personal content plus a clear sign-in/join
  // prompt, not be bounced before seeing anything. This guards against
  // that redirect silently coming back.
  const pages = [
    { path: '/mentorship/journey.html', mustContain: 'Start Your Journey' },
    { path: '/mentorship/resources.html', mustContain: 'Sign in' },
    { path: '/mentorship/stories.html', mustContain: 'What community looks like here' },
  ];

  for (const { path, mustContain } of pages) {
    test(`${path} stays put for an anonymous visitor and shows a sign-in prompt`, async ({ page }) => {
      const tracker = trackConsoleErrors(page);
      await page.goto(path);
      // Give the auth check (a real Supabase getUser() round-trip) time
      // to resolve and pick the visitor branch — same margin
      // auth-gating.spec.js uses for the opposite (redirect) case.
      await page.waitForTimeout(2000);
      expect(page.url()).toContain(path);
      await expect(page.locator('body')).toContainText(mustContain);
      await expect(page.locator('a:has-text("Sign In"), a:has-text("Sign in")').first()).toBeVisible();
      tracker.assertNoErrors();
    });
  }
});

test.describe('Mentorship auth pages', () => {
  test('login page renders the sign-in form', async ({ page }) => {
    const tracker = trackConsoleErrors(page);
    await page.goto('/mentorship/login.html');
    await expect(page.locator('form')).toBeVisible();
    tracker.assertNoErrors();
  });

  test('join.html (become a mentee) renders the signup form', async ({ page }) => {
    const tracker = trackConsoleErrors(page);
    await page.goto('/mentorship/join.html');
    await expect(page.locator('form')).toBeVisible();
    tracker.assertNoErrors();
  });

  test('join.html shows/hides guardian fields based on the under-18 answer', async ({ page }) => {
    const tracker = trackConsoleErrors(page);
    await page.goto('/mentorship/join.html');
    const guardianFields = page.locator('#guardianFields');
    const guardianName = page.locator('#guardianName');
    const guardianEmail = page.locator('#guardianEmail');

    // Hidden and not required before an answer is picked — this is the
    // "18 or older" majority case and must not force guardian info on it.
    await expect(guardianFields).toBeHidden();
    await expect(guardianName).toHaveJSProperty('required', false);
    await expect(guardianEmail).toHaveJSProperty('required', false);

    await page.selectOption('#isMinor', 'yes');
    await expect(guardianFields).toBeVisible();
    await expect(guardianName).toHaveJSProperty('required', true);
    await expect(guardianEmail).toHaveJSProperty('required', true);

    await page.selectOption('#isMinor', 'no');
    await expect(guardianFields).toBeHidden();
    await expect(guardianName).toHaveJSProperty('required', false);
    await expect(guardianEmail).toHaveJSProperty('required', false);

    tracker.assertNoErrors();
  });

  test('mentors.html (become a mentor) renders the application form', async ({ page }) => {
    const tracker = trackConsoleErrors(page);
    await page.goto('/mentorship/mentors.html');
    await expect(page.locator('form')).toBeVisible();
    tracker.assertNoErrors();
  });
});
