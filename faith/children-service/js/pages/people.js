// People and roles (church admins only). Everyone in this church with their email and last
// sign-in, and the actions an admin needs: add a teacher by email, give or take away a
// role, suspend or reactivate, and email a password reset. All of it goes through the
// cs-people Netlify function, which re-checks on the server that the caller is an active
// church admin: this page hides things, the function enforces them.
(async function () {
  var C = window.KIDS_CONFIG, K = window.KIDS;
  var session = await K.requireSession();
  if (!session) return;
  K.mountChrome({ signedIn: true });
  var app = document.getElementById('app');
  var FN = '/.netlify/functions/cs-people';
  var ROLE_LABEL = { church_admin: 'Church admin', safeguarding_lead: 'Safeguarding lead', facilitator: 'Teacher', assistant: 'Co-teacher', parent: 'Parent' };
  var ADD_ROLES = ['facilitator', 'assistant', 'safeguarding_lead', 'church_admin'];
  var church = '', people = [], confirming = null;

  async function api(action, extra) {
    var s = await K.session();                                    // always the freshest token
    var res, body;
    try {
      res = await fetch(FN, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (s ? s.access_token : '') },
        body: JSON.stringify(Object.assign({ action: action }, extra || {}))
      });
      body = await res.json();
    } catch (e) { throw new Error('We could not reach the server. Please try again in a moment.'); }
    if (!res.ok) { var err = new Error(body && body.error ? body.error : 'Something went wrong.'); err.status = res.status; throw err; }
    return body;
  }

  try { await load(); render(); }
  catch (e) {
    if (e.status === 403) return K.notice('<h2>Church admins only</h2><p>This page is for church admins. <a href="' + C.base + '/parent/index.html">Back to my family</a></p>');
    return K.notice('<h2>Something went wrong</h2><p>' + K.esc(e.message) + '</p>', 'bad');
  }

  async function load() {
    var r = await api('list');
    church = r.church.name; people = r.people;
  }

  function when(iso) { return iso ? K.fmtWhen(iso) : null; }
  function todayLocal() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function canSeeChildren(p) {
    return p.roles.some(function (r) { return r.role !== 'parent' && r.status === 'active' && r.dbs_checked_on && r.safeguarding_trained_on; });
  }
  function isStaff(p) { return p.roles.some(function (r) { return r.role !== 'parent'; }); }

  function render(flash, kind) {
    var html = '<h1>People and roles</h1><p class="lede">' + K.esc(church) + '</p>';
    if (flash) html += '<div class="card notice ' + (kind || 'good') + '" role="status">' + K.esc(flash) + '</div>';

    html += '<div class="card"><h2>Add a teacher</h2>' +
      '<p class="small muted">Type their email. If they already have an account they get the role straight away. If not, we email them an invitation to set a password.</p>' +
      '<form id="invite" novalidate><div class="field"><label for="i-email">Email</label><input id="i-email" type="email" autocomplete="off"></div>' +
      '<div class="field"><label for="i-name">First name (optional)</label><input id="i-name" type="text" maxlength="40" autocomplete="off"></div>' +
      '<div class="field"><label for="i-role">Role</label><select id="i-role">' + ADD_ROLES.map(function (r) { return '<option value="' + r + '"' + (r === 'facilitator' ? ' selected' : '') + '>' + ROLE_LABEL[r] + '</option>'; }).join('') + '</select>' +
      '<p class="hint">A teacher sees the lessons as children do, with teacher notes. They only see class lists and the meeting link once their DBS check and safeguarding training dates are recorded on their card below. Only record a date once the check or training has really happened.</p></div>' +
      '<p class="err" id="i-err" role="alert"></p><button class="btn btn-sun" type="submit" id="i-go">Add teacher</button></form></div>';

    var staff = people.filter(isStaff), families = people.filter(function (p) { return !isStaff(p); });
    html += '<h2 class="spaced">Teachers and leaders</h2>' + (staff.length ? staff.map(personHtml).join('') : '<div class="card"><p class="muted">No teachers yet.</p></div>');
    html += '<h2 class="spaced">Families</h2>' + (families.length ? families.map(personHtml).join('') : '<div class="card"><p class="muted">No families yet.</p></div>');
    html += '<p class="spaced row"><a class="btn btn-line btn-small" href="' + C.base + '/church-admin/index.html">Leader tools</a><a class="btn btn-line btn-small" href="' + C.base + '/teacher/index.html">Teacher home</a></p>';
    app.innerHTML = html;
    wire();
  }

  function personHtml(p) {
    var held = p.roles.map(function (r) { return r.role; });
    var addable = ADD_ROLES.filter(function (r) { return held.indexOf(r) < 0; });
    var status = when(p.last_sign_in_at) ? 'Last signed in ' + K.esc(when(p.last_sign_in_at)) : (p.confirmed ? 'Has not signed in yet' : 'Has not confirmed their email yet');
    var h = '<div class="card" data-person="' + K.esc(p.user_id) + '"><div class="row" style="justify-content:space-between;align-items:flex-start">' +
      '<div><strong style="font:600 22px var(--display)">' + K.esc(p.name || 'No name') + '</strong>' + (p.is_me ? ' <span class="chip">You</span>' : '') +
      '<br><span class="small">' + K.esc(p.email || 'No email') + '</span><br><span class="small muted">' + status + '</span>' +
      (isStaff(p) ? '<br><span class="small ' + (canSeeChildren(p) ? 'tick' : 'muted') + '">' + (canSeeChildren(p) ? '✓ Can see class lists' : 'Cannot see class lists yet (checks not recorded)') + '</span>' : '') + '</div>' +
      (p.email ? '<button type="button" class="btn btn-line btn-small" data-reset="' + K.esc(p.user_id) + '">Send password reset</button>' : '') + '</div>';
    p.roles.forEach(function (r) {
      var mineAdmin = p.is_me && r.role === 'church_admin';
      h += '<div class="session" style="margin-top:10px"><div><span class="chip">' + K.esc(ROLE_LABEL[r.role] || r.role) + '</span> <span class="small ' + (r.status === 'active' ? 'tick' : 'muted') + '">' + K.esc(r.status) + '</span></div><div class="row">';
      if (mineAdmin) {
        h += '<span class="small muted">You can’t change your own admin role</span>';
      } else if (confirming === r.id) {
        h += '<span class="small"><b>Remove this role?</b></span><button type="button" class="btn btn-danger btn-small" data-remove-yes="' + K.esc(r.id) + '">Yes, remove</button><button type="button" class="btn btn-line btn-small" data-remove-no="1">Keep</button>';
      } else {
        if (r.status === 'active') h += '<button type="button" class="btn btn-line btn-small" data-status="' + K.esc(r.id) + '" data-to="suspended">Suspend</button>';
        else if (r.status === 'suspended') h += '<button type="button" class="btn btn-line btn-small" data-status="' + K.esc(r.id) + '" data-to="active">Reactivate</button>';
        else h += '<button type="button" class="btn btn-sun btn-small" data-status="' + K.esc(r.id) + '" data-to="active">Approve</button>';
        if (r.role !== 'parent') h += '<button type="button" class="btn btn-danger btn-small" data-remove="' + K.esc(r.id) + '">Remove</button>';
      }
      h += '</div></div>';
      if (r.role !== 'parent') {
        // The two checks that unlock class lists and the meeting link. Both are needed.
        var both = r.status === 'active' && r.dbs_checked_on && r.safeguarding_trained_on;
        h += '<div class="row" data-checks="' + K.esc(r.id) + '" style="margin:6px 0 4px 6px;align-items:flex-end">' +
          '<label class="small">DBS check (or local equivalent)<br><input type="date" data-f="dbs" max="' + todayLocal() + '" value="' + K.esc(r.dbs_checked_on || '') + '"></label>' +
          '<label class="small">Safeguarding training<br><input type="date" data-f="train" max="' + todayLocal() + '" value="' + K.esc(r.safeguarding_trained_on || '') + '"></label>' +
          '<button type="button" class="btn btn-line btn-small" data-savechecks="' + K.esc(r.id) + '">Save dates</button>' +
          '<span class="small ' + (both ? 'tick' : 'muted') + '">' + (both ? '✓ Can see class lists' : 'Needs both dates') + '</span></div>';
      }
    });
    if (addable.length) {
      h += '<div class="row spaced"><select data-addrole-for="' + K.esc(p.user_id) + '" aria-label="Add a role for ' + K.esc(p.name || 'this person') + '"><option value="">Give another role…</option>' +
        addable.map(function (r) { return '<option value="' + r + '">' + ROLE_LABEL[r] + '</option>'; }).join('') + '</select></div>';
    }
    return h + '</div>';
  }

  async function act(fn, ok) {
    try { await fn(); await load(); confirming = null; render(ok); }
    catch (e) { confirming = null; render(e.message, 'bad'); }
  }

  function wire() {
    document.getElementById('invite').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var err = document.getElementById('i-err'), btn = document.getElementById('i-go');
      err.textContent = '';
      var email = document.getElementById('i-email').value.trim(), name = document.getElementById('i-name').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'That email address doesn’t look right.'; return; }
      if (/\s/.test(name)) { err.textContent = 'Please use just a first name.'; return; }
      btn.disabled = true;
      try {
        var r = await api('invite', { email: email, first_name: name, role: document.getElementById('i-role').value });
        await load();
        render(r.result === 'invited'
          ? 'Invitation sent to ' + r.email + '. They set their password from the email, then land on their teacher home.'
          : r.email + ' already had an account, so the role has been added. They will see it next time they sign in.');
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-status]'), function (b) {
      b.addEventListener('click', function () { b.disabled = true; act(function () { return api('set_status', { member_id: b.dataset.status, status: b.dataset.to }); }, b.dataset.to === 'active' ? 'Done. Access is back on.' : 'Done. That role is suspended and has no access.'); });
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-remove]'), function (b) {
      b.addEventListener('click', function () { confirming = b.dataset.remove; render(); });
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-remove-no]'), function (b) {
      b.addEventListener('click', function () { confirming = null; render(); });
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-remove-yes]'), function (b) {
      b.addEventListener('click', function () { b.disabled = true; act(function () { return api('remove_role', { member_id: b.dataset.removeYes }); }, 'Role removed.'); });
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-savechecks]'), function (b) {
      b.addEventListener('click', function () {
        var box = app.querySelector('[data-checks="' + b.dataset.savechecks + '"]');
        var dbs = box.querySelector('[data-f=dbs]').value || null, trn = box.querySelector('[data-f=train]').value || null;
        b.disabled = true;
        act(function () { return api('set_checks', { member_id: b.dataset.savechecks, dbs_checked_on: dbs, safeguarding_trained_on: trn }); },
          dbs && trn ? 'Dates saved. This person can now see class lists and the meeting link.' : 'Saved. They will see class lists once BOTH dates are recorded.');
      });
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-reset]'), function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        try { var r = await api('send_reset', { user_id: b.dataset.reset }); render('A password-reset email has been sent to ' + r.email + '.'); }
        catch (e) { render(e.message, 'bad'); }
      });
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-addrole-for]'), function (sel) {
      sel.addEventListener('change', function () {
        if (!sel.value) return;
        var role = sel.value; sel.disabled = true;
        act(function () { return api('assign_role', { user_id: sel.dataset.addroleFor, role: role }); }, ROLE_LABEL[role] + ' role added.');
      });
    });
  }
})();
