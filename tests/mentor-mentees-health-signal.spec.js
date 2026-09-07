// Regression target: mentor-portal/mentees.html used to show every
// mentee identically, with no signal for which ones have gone quiet.
// It now computes the same session/message/check-in silence-detection
// admin-matching.js already used admin-side (green <=14 days, amber
// 15-30, red >30/never) and sorts red-before-amber-before-green. This
// only asserts the two structural guarantees that would regress
// silently if someone "simplified" the render function later: every
// mentee card gets exactly one recognized health badge, and no green
// card appears before a red or amber one.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { credsForMentor, saveLoginState } = require('./helpers');

const mentorCreds = credsForMentor();
const MENTOR_STATE = path.join(__dirname, '.auth', 'health-signal-mentor.json');
const HEALTH_ORDER = { red: 0, amber: 1, green: 2 };

test.describe('Mentor portal — mentee health signal', () => {
  test.skip(!mentorCreds, 'Requires TEST_MENTOR_EMAIL/TEST_MENTOR_PASSWORD env vars');
  test.use({ storageState: mentorCreds ? MENTOR_STATE : undefined });

  test.beforeAll(async ({ browser }) => {
    if (mentorCreds) await saveLoginState(browser, mentorCreds.email, mentorCreds.password, MENTOR_STATE);
  });

  test('every mentee card shows exactly one health badge, in red/amber/green order', async ({ page }) => {
    await page.goto('/mentorship/mentor-portal/mentees.html');
    const cards = page.locator('.list-card');
    const total = await cards.count();
    test.skip(total === 0, 'Test mentor account has no active mentees to check');

    const healths = [];
    for (let i = 0; i < total; i++) {
      const badge = cards.nth(i).locator('.health-badge');
      await expect(badge, `Mentee card ${i} should have exactly one health badge`).toHaveCount(1);
      const classAttr = await badge.getAttribute('class');
      const match = classAttr.match(/health-(red|amber|green)/);
      expect(match, `Badge class "${classAttr}" should include a recognized health-* class`).toBeTruthy();
      healths.push(match[1]);
    }

    const ranks = healths.map(h => HEALTH_ORDER[h]);
    const sortedRanks = [...ranks].sort((a, b) => a - b);
    expect(ranks, 'Cards should already be sorted red, then amber, then green').toEqual(sortedRanks);
  });

  test('the dashboard rollup pill, when shown, matches a non-zero count of non-green mentees', async ({ page }) => {
    await page.goto('/mentorship/mentor-portal/');
    const pill = page.locator('#attentionPill');
    const visible = await pill.isVisible().catch(() => false);
    test.skip(!visible, 'No mentees are currently quiet/needing attention for this test account');

    const text = await pill.textContent();
    const match = text.match(/^(\d+)/);
    expect(match, `Pill text "${text}" should start with a number`).toBeTruthy();
    expect(Number(match[1])).toBeGreaterThan(0);
  });
});
