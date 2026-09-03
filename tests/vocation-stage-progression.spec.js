// Exercises the actual stage-progress state machine end to end: logging
// real evidence in the Test stage should enable "Mark Ready for Review",
// and clicking it should durably flip vocation_stage_progress.status —
// visible both immediately and after a reload (so this also guards against
// the class of bug fixed in commit 9f9ca12, where a change saved correctly
// but the UI never reflected it).
const { test, expect } = require('@playwright/test');
const path = require('path');
const { credsForMentee, saveLoginState } = require('./helpers');

const menteeCreds = credsForMentee();
const MENTEE_STATE = path.join(__dirname, '.auth', 'progression-mentee.json');

test.describe('Vocation stage progression', () => {
  test.skip(!menteeCreds, 'Requires TEST_MENTEE_EMAIL/TEST_MENTEE_PASSWORD env vars');
  test.use({ storageState: menteeCreds ? MENTEE_STATE : undefined });

  test.beforeAll(async ({ browser }) => {
    if (menteeCreds) await saveLoginState(browser, menteeCreds.email, menteeCreds.password, MENTEE_STATE);
  });

  test('logging one item in each Test category enables and completes the gate', async ({ page }) => {
    const marker = `PW test run ${Date.now()}`;
    await page.goto('/mentorship/dashboard/vocation/test.html');
    const markReadyBtn = page.locator('#markReadyBtn');
    // Not asserting markReadyBtn starts disabled — this account's Test
    // stage may already have entries from a previous run. The real
    // assertions are what happens once these new items land.

    // Which section auto-opens on load depends on which categories this
    // account already has entries in (renderAllSections() opens the first
    // empty one) — force all three open directly rather than clicking
    // headers, so this doesn't accidentally toggle an already-open one shut.
    await page.evaluate(() => {
      document.querySelectorAll('.voc-section').forEach((el) => el.classList.add('open'));
    });

    // 01 — Professional Conversation
    await page.fill('#convRole', `${marker} — Electrical Engineer`);
    await page.click('#addConvBtn');
    await expect(page.locator('.voc-entry-item', { hasText: marker })).toBeVisible();

    // 02 — Workplace Exposure
    await page.selectOption('#expType', 'visit');
    await page.fill('#expOrg', `${marker} — independent garage`);
    await page.click('#addExpBtn');
    await expect(page.locator('.voc-entry-item', { hasText: marker }).nth(1)).toBeVisible();

    // 03 — Mini Experiment
    await page.fill('#expmtHypothesis', `${marker} — I think I'd enjoy fault-finding`);
    await page.click('#addExpmtBtn');
    await expect(page.locator('.voc-entry-item', { hasText: marker }).nth(2)).toBeVisible();

    await expect(markReadyBtn).toBeEnabled();
    await markReadyBtn.click();
    await expect(markReadyBtn).toHaveText(/marked ready for review/i);

    // Reload — confirm both the gate state and the stepper's own status
    // class survive a fresh load, not just the in-memory click handler.
    await page.reload();
    const testStep = page.locator('a.vocation-stage-step[href*="test.html"]');
    await expect(testStep).toHaveClass(/ready_for_review/, { timeout: 15000 });
  });
});
