// Leader tools for a church_admin: approve families, give people leader roles
// and record their vetting dates, and schedule classes with their Zoom details.
//
// This page is a convenience, not the security boundary. Every action here is
// an ordinary Supabase call that row-level security allows only for an active
// church_admin of this church (see supabase/children_service_schema.sql). A
// non-admin who opens the page gets the "leaders only" notice and, even if
// they forced the calls through the console, the database would refuse them.
(async function () {
  var C = window.KIDS_CONFIG, K = window.KIDS;
  var session = await K.requireSession();
  if (!session) return;
  K.mountChrome({ signedIn: true });
  var app = document.getElementById('app');
  var cs = await K.cs();
  var me = session.user.id;
  var church, members = [], classes = [], lessons = [], sessions = [];
  var STAFF = ['church_admin', 'safeguarding_lead', 'facilitator', 'assistant'];
  var ROLE_LABEL = { church_admin: 'Church admin', safeguarding_lead: 'Safeguarding lead', facilitator: 'Teacher', assistant: 'Co-teacher' };

  try {
    var ch = await cs.rpc('church_by_slug', { p_slug: C.churchSlug });
    if (ch.error) throw ch.error;
    church = (ch.data || [])[0];
    if (!church) return K.notice('<h2>Not open yet</h2>');
    var adm = await cs.from('church_members').select('id').eq('user_id', me).eq('role', 'church_admin').eq('status', 'active').eq('church_id', church.id);
    if (adm.error) throw adm.error;
    if (!(adm.data || []).length) return K.notice('<h2>Leaders only</h2><p>This page is for church admins. <a href="' + C.base + '/parent/index.html">Back to my family</a></p>');
    await load();
    render();
  } catch (e) { return K.notice('<h2>Something went wrong</h2><p>' + K.esc(K.explain(e)) + '</p>', 'bad'); }

  async function load() {
    var r = await Promise.all([
      cs.from('church_members').select('id,user_id,role,status,display_name,dbs_checked_on,safeguarding_trained_on,created_at').eq('church_id', church.id).order('created_at'),
      cs.from('classes').select('id,name,age_band').eq('church_id', church.id).eq('active', true).order('age_band'),
      cs.from('lessons').select('id,slug,character_name').eq('status', 'published').order('sequence'),
      cs.from('sessions').select('id,class_id,lesson_id,starts_at,duration_min,platform,status,teacher_name').eq('church_id', church.id).order('starts_at')
    ]);
    r.forEach(function (x) { if (x.error) throw x.error; });
    members = r[0].data || []; classes = r[1].data || []; lessons = r[2].data || []; sessions = r[3].data || [];
  }

  function nameOf(m) { return m.display_name || 'Unnamed'; }
  // First names of everyone who can teach (active staff), for the "Teacher" choice on a class.
  // The chosen name is what parents see in the after-class email.
  function teacherNames() {
    var seen = {}, out = [];
    members.forEach(function (m) {
      if (STAFF.indexOf(m.role) >= 0 && m.status === 'active' && m.display_name && !seen[m.display_name]) { seen[m.display_name] = 1; out.push(m.display_name); }
    });
    return out;
  }
  function teacherOptions(current) {
    var names = teacherNames();
    if (current && names.indexOf(current) < 0) names.push(current);           // keep an existing name even if they have since left
    return opt('', 'Not set yet', !current) + names.map(function (n) { return opt(n, n, n === current); }).join('');
  }
  var previewing = null;                                                       // { id, subject, html, sample } while the email preview is open
  async function callSummary(action, sessionId) {
    var s = await K.session(), res, body;
    try {
      res = await fetch('/.netlify/functions/cs-class-summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (s ? s.access_token : '') },
        body: JSON.stringify({ action: action, session_id: sessionId })
      });
      body = await res.json();
    } catch (e) { throw new Error('We could not reach the server. Please try again in a moment.'); }
    if (!res.ok) throw new Error(body && body.error ? body.error : 'Something went wrong.');
    return body;
  }
  function opt(v, t, sel) { return '<option value="' + K.esc(v) + '"' + (sel ? ' selected' : '') + '>' + K.esc(t) + '</option>'; }

  function render(flash, kind) {
    var pending = members.filter(function (m) { return m.role === 'parent' && m.status === 'pending'; });
    var activeParents = members.filter(function (m) { return m.role === 'parent' && m.status === 'active'; });
    var staff = members.filter(function (m) { return STAFF.indexOf(m.role) >= 0; });
    var html = '<h1>Leader tools</h1><p class="lede">' + K.esc(church.name) + '</p>' +
      '<p><a class="btn btn-sun btn-small" href="' + C.base + '/church-admin/people.html">People and roles</a> ' +
      '<span class="small muted">Add a teacher, see emails and last sign-in, send password resets.</span></p>';
    if (flash) html += '<div class="card notice ' + (kind || 'good') + '" role="status">' + K.esc(flash) + '</div>';

    // ---- families waiting
    html += '<div class="card"><h2>Families waiting for approval</h2>';
    if (!pending.length) html += '<p class="muted">Nobody is waiting. ' + activeParents.length + ' approved ' + (activeParents.length === 1 ? 'family' : 'families') + '.</p>';
    pending.forEach(function (m) {
      html += '<div class="session"><div><strong>' + K.esc(nameOf(m)) + '</strong><br><span class="small muted">Asked on ' + K.esc(K.fmtWhen(m.created_at)) + '</span></div>' +
        '<div class="row"><button type="button" class="btn btn-sun btn-small" data-approve="' + K.esc(m.id) + '">Approve</button>' +
        '<button type="button" class="btn btn-danger btn-small" data-decline="' + K.esc(m.id) + '">Decline</button></div></div>';
    });
    html += '<p class="small muted spaced">Only approve people you know. We only hold a first name, so check who they are with them directly before approving.</p></div>';

    // ---- leaders
    html += '<div class="card"><h2>Leaders</h2><p class="small muted">A leader can only see children once <b>both</b> dates are recorded. Record a date only when the check or training has really happened.</p>';
    staff.forEach(function (m) {
      var ok = m.status === 'active' && m.dbs_checked_on && m.safeguarding_trained_on;
      html += '<div class="session" data-staff="' + K.esc(m.id) + '"><div><strong>' + K.esc(nameOf(m)) + '</strong> &middot; ' + K.esc(ROLE_LABEL[m.role]) +
        '<br><span class="small ' + (ok ? 'tick' : 'muted') + '">' + (ok ? '✓ Can see children' : 'Cannot see children yet') + '</span></div>' +
        '<div class="row"><label class="small">DBS (or local equivalent)<br><input type="date" data-f="dbs" value="' + K.esc(m.dbs_checked_on || '') + '"></label>' +
        '<label class="small">Safeguarding training<br><input type="date" data-f="train" value="' + K.esc(m.safeguarding_trained_on || '') + '"></label>' +
        '<button type="button" class="btn btn-line btn-small" data-savestaff="' + K.esc(m.id) + '">Save</button></div></div>';
    });
    html += '<h3 class="spaced" style="font-size:22px">Give an approved family member a teacher role</h3>' +
      '<p class="small muted">They need to have signed up and been approved first.</p>' +
      '<div class="row"><select id="role-who" aria-label="Person">' + activeParents.map(function (m) { return opt(m.user_id, nameOf(m)); }).join('') + '</select>' +
      '<select id="role-what" aria-label="Role">' + STAFF.map(function (r) { return opt(r, ROLE_LABEL[r], r === 'facilitator'); }).join('') + '</select>' +
      '<button type="button" class="btn btn-line btn-small" id="role-add"' + (activeParents.length ? '' : ' disabled') + '>Add role</button></div><p class="err" id="role-err" role="alert"></p></div>';

    // ---- schedule
    html += '<div class="card"><h2>Schedule a class</h2><form id="sess-form" novalidate>' +
      '<div class="field"><label for="s-class">Class</label><select id="s-class">' + classes.map(function (c) { return opt(c.id, c.name); }).join('') + '</select></div>' +
      '<div class="field"><label for="s-lesson">Lesson</label><select id="s-lesson">' + opt('', 'No lesson yet') + lessons.map(function (l) { return opt(l.id, l.character_name); }).join('') + '</select></div>' +
      '<div class="field"><label for="s-teacher">Teacher</label><select id="s-teacher">' + teacherOptions('') + '</select><p class="hint">Named in the short email parents receive after class. You can change it later.</p></div>' +
      '<div class="field"><label for="s-when">Starts</label><input id="s-when" type="datetime-local"><p class="hint">In your device’s time zone.</p></div>' +
      '<div class="field"><label for="s-dur">Length (minutes)</label><input id="s-dur" type="number" min="10" max="120" value="28"></div>' +
      '<div class="field"><label for="s-plat">Meeting app</label><select id="s-plat">' + opt('zoom', 'Zoom', true) + opt('teams', 'Teams') + '</select></div>' +
      '<div class="field"><label for="s-url">Meeting link</label><input id="s-url" type="text" placeholder="https://…" autocomplete="off"><p class="hint">Must start with https://. Families only see it 30 minutes before class.</p></div>' +
      '<div class="field"><label for="s-mid">Meeting ID (optional)</label><input id="s-mid" type="text" autocomplete="off"></div>' +
      '<div class="field"><label for="s-pw">Passcode (optional)</label><input id="s-pw" type="text" autocomplete="off"></div>' +
      '<p class="err" id="s-err" role="alert"></p><button class="btn btn-sun" type="submit" id="s-go"' + (classes.length ? '' : ' disabled') + '>Schedule class</button>' +
      (classes.length ? '' : '<p class="small muted">There are no classes yet. Run the seed file first.</p>') + '</form></div>';

    html += '<div class="card"><h2>All classes</h2><p class="small muted">After a class, parents whose child attended get a short email: what was studied, who taught, and questions to talk about. Use <b>Preview parent email</b> to see exactly what they will receive, or <b>Send me a test</b> to get it in your own inbox. Neither ever emails a parent.</p>';
    if (previewing) html += '<div class="card notice good" id="preview-card"><strong>Subject:</strong> ' + K.esc(previewing.subject) + (previewing.sample ? ' <span class="small muted">(shown for a sample child called Johnny)</span>' : '') +
      '<div id="preview-frame" style="margin-top:10px"></div><p class="row spaced"><button type="button" class="btn btn-line btn-small" id="preview-close">Close preview</button></p></div>';
    if (!sessions.length) html += '<p class="muted">No classes scheduled yet.</p>';
    sessions.slice().reverse().forEach(function (s) {
      var cl = classes.filter(function (c) { return c.id === s.class_id; })[0];
      var le = lessons.filter(function (l) { return l.id === s.lesson_id; })[0];
      html += '<div class="session" style="flex-direction:column;align-items:stretch"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><strong>' + K.esc(K.fmtWhen(s.starts_at)) + '</strong><br><span class="small muted">' + K.esc(cl ? cl.name : 'Class') +
        (le ? ' &middot; ' + K.esc(le.character_name) : '') + ' &middot; ' + s.duration_min + ' min &middot; ' + K.esc(s.status) + '</span></div>' +
        (s.status === 'scheduled' ? '<button type="button" class="btn btn-danger btn-small" data-cancel="' + K.esc(s.id) + '">Cancel class</button>' : '') + '</div>' +
        '<div class="row" style="margin-top:8px"><label class="small">Teacher <select data-teacher-for="' + K.esc(s.id) + '" aria-label="Teacher for this class">' + teacherOptions(s.teacher_name) + '</select></label>' +
        '<button type="button" class="btn btn-line btn-small" data-preview="' + K.esc(s.id) + '">Preview parent email</button>' +
        '<button type="button" class="btn btn-line btn-small" data-sendtest="' + K.esc(s.id) + '">Send me a test</button></div></div>';
    });
    html += '</div>';
    app.innerHTML = html;
    if (previewing) {                                                          // the email itself, in a locked-down frame (scripts can't run in it)
      var host = document.getElementById('preview-frame');
      if (host) {
        var f = document.createElement('iframe');
        f.setAttribute('sandbox', ''); f.setAttribute('title', 'Parent email preview');
        f.style.cssText = 'width:100%;height:560px;border:1px solid #efe3c8;border-radius:12px;background:#fff';
        f.srcdoc = previewing.html;
        host.appendChild(f);
      }
    }
    wire();
  }

  async function act(fn, ok) {
    try {
      var res = await fn();
      if (res && res.error) throw res.error;
      await load();
      render(ok);
    } catch (e) { render('That didn’t work: ' + K.explain(e), 'bad'); }
  }

  function wire() {
    Array.prototype.forEach.call(app.querySelectorAll('[data-approve]'), function (b) {
      b.addEventListener('click', function () { b.disabled = true; act(function () { return cs.from('church_members').update({ status: 'active' }).eq('id', b.dataset.approve); }, 'Family approved. They can now add their children.'); });
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-decline]'), function (b) {
      b.addEventListener('click', function () { b.disabled = true; act(function () { return cs.from('church_members').delete().eq('id', b.dataset.decline); }, 'Request declined.'); });
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-savestaff]'), function (b) {
      b.addEventListener('click', function () {
        var row = app.querySelector('[data-staff="' + b.dataset.savestaff + '"]');
        var dbs = row.querySelector('[data-f=dbs]').value || null, tr = row.querySelector('[data-f=train]').value || null;
        b.disabled = true;
        act(function () { return cs.from('church_members').update({ dbs_checked_on: dbs, safeguarding_trained_on: tr }).eq('id', b.dataset.savestaff); }, 'Saved.');
      });
    });
    var add = document.getElementById('role-add');
    if (add) add.addEventListener('click', async function () {
      var uid = document.getElementById('role-who').value, role = document.getElementById('role-what').value;
      var who = members.filter(function (m) { return m.user_id === uid && m.role === 'parent'; })[0];
      var r = await cs.from('church_members').insert({ church_id: church.id, user_id: uid, role: role, status: 'active', display_name: who ? who.display_name : null });
      if (r.error) { document.getElementById('role-err').textContent = r.error.code === '23505' ? 'They already have that role.' : K.explain(r.error); return; }
      await load(); render('Role added. They still need both dates recorded before they can see children.');
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-teacher-for]'), function (sel) {
      sel.addEventListener('change', function () {
        var v = sel.value || null; sel.disabled = true;
        act(function () { return cs.from('sessions').update({ teacher_name: v }).eq('id', sel.dataset.teacherFor); }, v ? 'Teacher saved: ' + v + '.' : 'Teacher cleared. The email will not name a teacher.');
      });
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-preview]'), function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        try { var r = await callSummary('preview', b.dataset.preview); previewing = { id: b.dataset.preview, subject: r.subject, html: r.html, sample: r.sample }; render(); var pc = document.getElementById('preview-card'); if (pc && pc.scrollIntoView) pc.scrollIntoView({ block: 'start' }); }
        catch (e) { render(e.message, 'bad'); }
      });
    });
    var pclose = document.getElementById('preview-close');
    if (pclose) pclose.addEventListener('click', function () { previewing = null; render(); });
    Array.prototype.forEach.call(app.querySelectorAll('[data-sendtest]'), function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        try { var r = await callSummary('send_test', b.dataset.sendtest); render('Test sent to ' + r.to + '. Check your inbox (and spam). No parent was emailed.'); }
        catch (e) { render(e.message, 'bad'); }
      });
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-cancel]'), function (b) {
      b.addEventListener('click', function () { b.disabled = true; act(function () { return cs.from('sessions').update({ status: 'cancelled' }).eq('id', b.dataset.cancel); }, 'Class cancelled. Families will see that it is cancelled.'); });
    });

    var sel = document.getElementById('s-class');
    if (sel) {
      var setDur = function () { var c = classes.filter(function (x) { return x.id === sel.value; })[0]; document.getElementById('s-dur').value = c && c.age_band === 'trailblazer' ? 42 : 28; };
      sel.addEventListener('change', setDur); setDur();
      document.getElementById('sess-form').addEventListener('submit', createSession);
    }
  }

  async function createSession(e) {
    e.preventDefault();
    var err = document.getElementById('s-err'), btn = document.getElementById('s-go');
    err.textContent = '';
    var when = document.getElementById('s-when').value, url = document.getElementById('s-url').value.trim();
    var dur = parseInt(document.getElementById('s-dur').value, 10);
    if (!when) { err.textContent = 'Please choose a start time.'; return; }
    if (!(dur >= 10 && dur <= 120)) { err.textContent = 'Length must be between 10 and 120 minutes.'; return; }
    if (!/^https:\/\//i.test(url)) { err.textContent = 'The meeting link must start with https://'; return; }
    var plat = document.getElementById('s-plat').value;
    if (plat === 'zoom' && dur > 40) err.textContent = 'Note: free Zoom accounts end meetings at 40 minutes.';
    var id = crypto.randomUUID();
    btn.disabled = true;
    var r1 = await cs.from('sessions').insert({
      id: id, church_id: church.id, class_id: document.getElementById('s-class').value,
      lesson_id: document.getElementById('s-lesson').value || null,
      teacher_name: document.getElementById('s-teacher').value || null,
      starts_at: new Date(when).toISOString(), duration_min: dur, platform: plat, status: 'scheduled'
    });
    if (r1.error) { err.textContent = K.explain(r1.error); btn.disabled = false; return; }
    var r2 = await cs.from('session_join_details').insert({
      session_id: id, join_url: url,
      meeting_id: document.getElementById('s-mid').value.trim() || null,
      passcode: document.getElementById('s-pw').value.trim() || null
    });
    if (r2.error) {                                   // don't leave a class with no link
      await cs.from('sessions').delete().eq('id', id);
      err.textContent = K.explain(r2.error); btn.disabled = false; return;
    }
    await load(); render('Class scheduled. Families will see it on their page, and get the meeting link 30 minutes before.');
  }
})();
