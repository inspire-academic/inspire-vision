(async function () {
  var K = window.KIDS;
  K.mountChrome({ signedIn: false });
  var next = K.safeNext(K.qs('next'));
  var form = document.getElementById('form'), err = document.getElementById('err'), go = document.getElementById('go');

  if (await K.session()) { location.replace(next); return; }

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
