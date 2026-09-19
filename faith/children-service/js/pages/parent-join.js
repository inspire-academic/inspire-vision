// Parent sign-up. Creates a Supabase auth account only. Consent is NOT
// collected here: with email confirmation switched on there is no session
// yet, so the consent step lives on the family home page instead, where it
// is enforced before anything else (see parent-home.js).
(async function () {
  var C = window.KIDS_CONFIG, K = window.KIDS;
  K.mountChrome({ signedIn: false });
  var form = document.getElementById('form'), err = document.getElementById('err'), go = document.getElementById('go');

  if (await K.session()) { location.replace(C.base + '/parent/index.html'); return; }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.textContent = '';
    var name = document.getElementById('name').value.trim();
    var email = document.getElementById('email').value.trim();
    var pw = document.getElementById('pw').value;
    if (!name) { err.textContent = 'Please tell us your first name.'; return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'That email address doesn’t look right.'; return; }
    if (pw.length < 8) { err.textContent = 'Please choose a password with at least 8 characters.'; return; }
    if (!document.getElementById('adult').checked) { err.textContent = 'Accounts are for parents and carers aged 18 or over.'; return; }

    go.disabled = true; go.textContent = 'Creating…';
    try {
      var db = await getDB();
      var res = await db.auth.signUp({
        email: email,
        password: pw,
        options: {
          data: { full_name: name },
          emailRedirectTo: location.origin + C.base + '/parent/index.html'
        }
      });
      if (res.error) throw res.error;
      if (res.data && res.data.session) { location.href = C.base + '/parent/index.html'; return; }
      K.notice('<h2>Check your email</h2><p>We’ve sent a link to <b>' + K.esc(email) + '</b>. Tap it to confirm, then <a href="' + C.base + '/parent/login.html">sign in</a>.</p><p class="small muted">Nothing arrived? Look in your spam folder. If you already have an account, use Sign in instead.</p>', 'good');
    } catch (ex) {
      err.textContent = /already|registered/i.test(ex.message || '') ? 'That email already has an account. Please sign in instead.' : (ex.message || 'Something went wrong. Please try again.');
      go.disabled = false; go.textContent = 'Create account';
    }
  });
})();
