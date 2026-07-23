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

module.exports = { trackConsoleErrors };
