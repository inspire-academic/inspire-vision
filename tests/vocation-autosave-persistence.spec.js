// "Return and continue" is core to the brief — nothing in this module is
// supposed to require finishing in one sitting. Each test here fills a
// field, reloads the page cold, and confirms the value is still there —
// i.e. it round-tripped through Supabase, not just React-style in-memory
// state. This is the regression class commit 9f9ca12 fixed (a value saved
// correctly but the UI never showed it without a reload); these tests
// specifically include the reload step so a future regression there fails
// loudly instead of only being caught by an unlucky manual click-through.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { credsForMentee, saveLoginState } = require('./helpers');

const menteeCreds = credsForMentee();
const MENTEE_STATE = path.join(__dirname, '.auth', 'autosave-mentee.json');

test.describe('Vocation autosave persistence', () => {
  test.skip(!menteeCreds, 'Requires TEST_MENTEE_EMAIL/TEST_MENTEE_PASSWORD env vars');
  test.use({ storageState: menteeCreds ? MENTEE_STATE : undefined });

  test.beforeAll(async ({ browser }) => {
    if (menteeCreds) await saveLoginState(browser, menteeCreds.email, menteeCreds.password, MENTEE_STATE);
  });

  test('Discover — a rating dot and a free-text note both survive a reload', async ({ page }) => {
    await page.goto('/mentorship/dashboard/vocation/discover.html');
    await page.locator('[data-section="discover.alive"]').evaluate((el) => el.classList.add('open'));

    // Rate the first statement 4/5 — the specific bug fixed in 9f9ca12
    // made this LOOK like a no-op immediately after clicking.
    await page.locator('[data-alive-dot][data-stmt="0"][data-score="4"]').click();
    const uniqueNote = `PW autosave check ${Date.now()}`;
    await page.fill('#aliveNotes', uniqueNote);
    // debounceAutosave waits 700ms before writing — give it real margin.
    await page.waitForTimeout(1200);

    await page.reload();
    await page.locator('[data-section="discover.alive"]').evaluate((el) => el.classList.add('open'));
    await expect(page.locator('[data-alive-dot][data-stmt="0"][data-score="4"]')).toHaveClass(/\bon\b/);
    await expect(page.locator('[data-alive-dot][data-stmt="0"][data-score="5"]')).not.toHaveClass(/\bon\b/);
    await expect(page.locator('#aliveNotes')).toHaveValue(uniqueNote);
  });

  test('Discern — the Current Working Statement of Vocation survives a reload', async ({ page }) => {
    await page.goto('/mentorship/dashboard/vocation/discern.html');
    const uniqueStatement = `PW working statement check ${Date.now()}`;
    await page.fill('#workingStatement', uniqueStatement);
    await page.waitForTimeout(1200);

    await page.reload();
    await expect(page.locator('#workingStatement')).toHaveValue(uniqueStatement);

    // The dashboard hub reads the same row — confirms this isn't just the
    // page re-reading its own just-written local state.
    await page.goto('/mentorship/dashboard/vocation/index.html');
    await expect(page.locator('#statementText')).toContainText(uniqueStatement);
  });

  test('Present — a checklist item\'s done state survives a reload', async ({ page }) => {
    await page.goto('/mentorship/dashboard/vocation/present.html');
    const uniqueItem = `PW checklist check ${Date.now()}`;
    await page.fill('#talkingPointInput', uniqueItem);
    await page.click('#addTalkingPointBtn');
    const row = page.locator('.voc-checklist-item', { hasText: uniqueItem });
    await row.locator('.voc-checkbox').click();
    await expect(row.locator('.voc-checklist-text')).toHaveClass(/\bdone\b/);
    await page.waitForTimeout(800);

    await page.reload();
    const reloadedRow = page.locator('.voc-checklist-item', { hasText: uniqueItem });
    await expect(reloadedRow.locator('.voc-checklist-text')).toHaveClass(/\bdone\b/);
  });
});
