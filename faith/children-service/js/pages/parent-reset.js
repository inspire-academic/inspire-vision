// Landing page for the emailed "choose a new password" link. The Supabase SDK
// turns the link's token into a short-lived session by itself; we wait a moment
// for that, then let the parent choose a new password. With no session (link
// expired, already used, or someone just typed the URL) we send them back to
// ask for a fresh one.
(async function () {
  var C = window.KIDS_CONFIG, K = window.KIDS;
  K.mountChrome({ signedIn: false });
  var app = document.getElementById('app');

  var session = null;
  for (var i = 0; i < 20 && !session; i++) {
    session = await K.session();
    if (!session) await new Promise(function (r) { setTimeout(r, 250); });
  }
  if (!session) {
    return K.notice('<h2>This link has expired</h2><p>Reset links only work once, for a short time. <a href="' + C.base + '/parent/login.html">Go to sign in</a> and choose “Forgot your password?” to get a fresh one.</p>', 'bad');
  }

  app.innerHTML = '<h1>Choose a new password</h1><form class="card" id="form" novalidate>' +
    '<div class="field"><label for="pw">New password</label><input id="pw" type="password" autocomplete="new-password" minlength="8"><p class="hint">At least 8 characters.</p></div>' +
    '<div class="field"><label for="pw2">Type it again</label><input id="pw2" type="password" autocomplete="new-password"></div>' +
    '<p class="err" id="err" role="alert"></p><button class="btn btn-sun" type="submit" id="go">Save new password</button></form>';

  document.getElementById('form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = document.getElementById('err'), go = document.getElementById('go');
    var a = document.getElementById('pw').value, b = document.getElementById('pw2').value;
    err.textContent = '';
    if (a.length < 8) { err.textContent = 'Please choose a password with at least 8 characters.'; return; }
    if (a !== b) { err.textContent = 'The two passwords don’t match.'; return; }
    go.disabled = true;
    try {
      var db = await getDB();
      var res = await db.auth.updateUser({ password: a });
      if (res.error) throw res.error;
      K.notice('<h2>Password changed</h2><p>You’re signed in. <a href="' + C.base + '/parent/index.html">Go to my family</a></p>', 'good');
    } catch (ex) {
      err.textContent = ex.message || 'We couldn’t change your password. Please ask for a new link.';
      go.disabled = false;
    }
  });
})();
