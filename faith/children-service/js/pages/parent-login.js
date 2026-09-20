(async function () {
  var K = window.KIDS;
  K.mountChrome({ signedIn: false });
  var next = K.safeNext(K.qs('next'));
  var form = document.getElementById('form'), err = document.getElementById('err'), go = document.getElementById('go');

  if (await K.session()) { location.replace(next); return; }

  // Forgot password: uses whatever is in the email box. The reply is always the
  // same whether or not the address has an account, so this can't be used to
  // find out who has one.
  document.getElementById('forgot').addEventListener('click', async function () {
    var info = document.getElementById('info');
    err.textContent = ''; info.textContent = '';
    var email = document.getElementById('email').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Type your email address in the box above first.'; return; }
    try {
      var db = await getDB();
      await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + window.KIDS_CONFIG.base + '/parent/reset.html' });
    } catch (ex) { /* deliberately ignored: same message either way */ }
    info.textContent = 'If that email has an account, we’ve sent a link to choose a new password. Check your spam folder too.';
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.textContent = '';
    var email = document.getElementById('email').value.trim();
    var pw = document.getElementById('pw').value;
    if (!email || !pw) { err.textContent = 'Please enter your email and password.'; return; }
    go.disabled = true; go.textContent = 'Signing in…';
    try {
      var db = await getDB();
      var res = await db.auth.signInWithPassword({ email: email, password: pw });
      if (res.error) throw res.error;
      location.href = next;
    } catch (ex) {
      err.textContent = /confirm/i.test(ex.message || '')
        ? 'Please confirm your email first. Check your inbox for our link.'
        : 'That email and password don’t match. Please try again.';
      go.disabled = false; go.textContent = 'Sign in';
    }
  });
})();
