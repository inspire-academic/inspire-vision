// Pink & Powerful (Brovelyn Childcare Services x Inspire Health & Wellbeing)
// event registration page — pages/pink-powerful-registration.html.
//
// The legacy-URL 301 redirects (/Pink&PowerfullRegistration,
// /Pink%26PowerfullRegistration -> /pink-powerful-registration) are defined
// in netlify.toml and only take effect under Netlify's own redirect engine
// — the local `serve`-based dev server this suite runs against (see
// playwright.config.js) does not implement Netlify's [[redirects]], so
// those two are checked here as config assertions against netlify.toml
// instead of live HTTP requests. The canonical clean URL *is* live-tested
// below, via the equivalent rewrite added to tests/serve.json.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { trackConsoleErrors } = require('./helpers');

test.describe('Pink & Powerful registration page', () => {
  for (const url of ['/pages/pink-powerful-registration.html', '/pink-powerful-registration']) {
    test(`loads at ${url} with real content, no console errors`, async ({ page }) => {
      const tracker = trackConsoleErrors(page);
      await page.goto(url);
      await expect(page).toHaveTitle(/Pink & Powerful/);
      await expect(page.locator('h1.title')).toContainText('Pink');
      await expect(page.locator('h1.title')).toContainText('Powerful');
      await expect(page.locator('.tagline')).toContainText('Stories. Support. Hope.');
      await expect(page.locator('body')).toContainText('18th October 2026');
      await expect(page.locator('form#interestForm')).toBeVisible();
      tracker.assertNoErrors();
    });
  }

  test('has a canonical link tag pointing at the clean URL', async ({ page }) => {
    await page.goto('/pages/pink-powerful-registration.html');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://inspirevision.org/pink-powerful-registration');
  });

  test('shows the Brovelyn logo before the Inspire Health & Wellbeing logo, and the collaboration line', async ({ page }) => {
    await page.goto('/pages/pink-powerful-registration.html');
    const logos = page.locator('.logos .logo-box img');
    await expect(logos).toHaveCount(2);
    await expect(logos.nth(0)).toHaveAttribute('alt', 'Brovelyn Childcare Services');
    await expect(logos.nth(1)).toHaveAttribute('alt', /Inspire Health/);
    await expect(page.locator('.collab')).toContainText('In collaboration, presents');
  });

  test('privacy consent is required, marketing consent is optional', async ({ page }) => {
    await page.goto('/pages/pink-powerful-registration.html');
    await expect(page.locator('input[name="privacy_consent"]')).toHaveJSProperty('required', true);
    await expect(page.locator('input[name="marketing_consent"]')).toHaveJSProperty('required', false);
  });

  test('honeypot field is present but hidden from real visitors', async ({ page }) => {
    await page.goto('/pages/pink-powerful-registration.html');
    const honeypot = page.locator('input[name="website"]');
    await expect(honeypot).toHaveAttribute('aria-hidden', 'true');
    await expect(honeypot).toHaveAttribute('tabindex', '-1');
  });

  test('required-field validation blocks submission before Supabase is ever called', async ({ page }) => {
    const tracker = trackConsoleErrors(page);
    await page.goto('/pages/pink-powerful-registration.html');
    await page.click('#submitButton');
    // Native HTML5 validation should keep the browser on the same page
    // with the modal still closed — nothing was submitted.
    await expect(page.locator('#successModal')).not.toHaveClass(/open/);
    tracker.assertNoErrors();
  });

  test('interest dropdown offers all documented options', async ({ page }) => {
    await page.goto('/pages/pink-powerful-registration.html');
    const values = await page.locator('#interest option').evaluateAll(opts => opts.map(o => o.value));
    expect(values).toEqual(['', 'attending', 'survivor-story', 'volunteering', 'healthcare-partner', 'sponsorship', 'community-partner', 'updates', 'other']);
  });

  test('layout adapts at mobile width without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/pages/pink-powerful-registration.html');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});

test.describe('Pink & Powerful routing config', () => {
  const netlifyToml = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8');

  test('netlify.toml rewrites the canonical clean URL to the page file', () => {
    expect(netlifyToml).toMatch(/from = "\/pink-powerful-registration"\s*\n\s*to = "\/pages\/pink-powerful-registration\.html"\s*\n\s*status = 200/);
  });

  test('netlify.toml permanently redirects both legacy requested URLs', () => {
    expect(netlifyToml).toMatch(/from = "\/Pink&PowerfullRegistration"\s*\n\s*to = "\/pink-powerful-registration"\s*\n\s*status = 301/);
    expect(netlifyToml).toMatch(/from = "\/Pink%26PowerfullRegistration"\s*\n\s*to = "\/pink-powerful-registration"\s*\n\s*status = 301/);
  });
});
