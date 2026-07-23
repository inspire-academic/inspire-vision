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

  test('mentors.html (become a mentor) renders the application form', async ({ page }) => {
    const tracker = trackConsoleErrors(page);
    await page.goto('/mentorship/mentors.html');
    await expect(page.locator('form')).toBeVisible();
    tracker.assertNoErrors();
  });
});
