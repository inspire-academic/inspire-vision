// Teacher home. Looks like a child's home (same cards, same colours) but leads to TEACHING:
// open a lesson exactly as children see it (with a few teacher notes), and a basic class list.
// Access is by role (church_members), never by anything the browser claims about itself.
(async function () {
  var C = window.KIDS_CONFIG, K = window.KIDS;
  var session = await K.requireSession();
  if (!session) return;
  K.mountChrome({ signedIn: true, teacher: true });

  var app = document.getElementById('app');
  var cs = await K.cs();
  var me = session.user.id;
  var STAFF = ['facilitator', 'assistant', 'church_admin', 'safeguarding_lead'];
  var LABEL = { facilitator: 'Teacher', assistant: 'Co-teacher', church_admin: 'Church admin', safeguarding_lead: 'Safeguarding lead' };

  try {
    var ch = await cs.rpc('church_by_slug', { p_slug: C.churchSlug });
    if (ch.error) throw ch.error;
    var church = (ch.data || [])[0];
    if (!church) return K.notice('<h2>Not open yet</h2>');

    var mem = await cs.from('church_members').select('role,status,display_name,dbs_checked_on,safeguarding_trained_on')
      .eq('user_id', me).eq('church_id', church.id).in('role', STAFF);
    if (mem.error) throw mem.error;
    var mine = (mem.data || []).filter(function (m) { return m.status === 'active'; });
    if (!mine.length) {
      return K.notice('<h2>Teacher tools are for teachers</h2><p>If you should have access, ask your church admin to give your account the Teacher role. <a href="' + C.base + '/parent/index.html?stay=1">Back to my family</a></p>');
    }
    var name = (mine[0].display_name || (session.user.user_metadata && session.user.user_metadata.full_name) || '');
    var vetted = mine.some(function (m) { return m.dbs_checked_on && m.safeguarding_trained_on; });
    var isAdmin = mine.some(function (m) { return m.role === 'church_admin'; });

    var res = await Promise.all([
      cs.from('lessons').select('id,slug,character_name,sequence,content').eq('status', 'published').order('sequence'),
      cs.from('sessions').select('id,class_id,lesson_id,starts_at,duration_min,status').order('starts_at'),
      cs.from('classes').select('id,name,age_band')
    ]);
    res.forEach(function (r) { if (r.error) throw r.error; });
    var lessons = res[0].data || [], classes = {}, lessonById = {};
    (res[2].data || []).forEach(function (c) { classes[c.id] = c; });
    lessons.forEach(function (l) { lessonById[l.id] = l; });
    var cutoff = Date.now() - 3 * 86400000;
    var sessions = (res[1].data || []).filter(function (s) { return new Date(s.starts_at).getTime() > cutoff; }).slice(0, 10);

    var roles = mine.map(function (m) { return LABEL[m.role]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' · ');
    var html = '<h1>Hello' + (name ? ', ' + K.esc(name) : '') + '!</h1><p class="lede">' + K.esc(church.name) + ' · ' + K.esc(roles) + '</p>';

    if (!vetted) {
      html += '<div class="card notice"><h2>One more step</h2><p>Class lists and the meeting link appear once your DBS check (or local equivalent) and safeguarding training have been recorded. Ask your church admin. You can already teach from the lessons below.</p></div>';
    }

    html += '<h2>Teach a lesson</h2>';
    if (!lessons.length) html += '<p class="muted">No lessons are published yet.</p>';
    lessons.forEach(function (l) {
      var c = (l.content && l.content.character) || {};
      var link = function (band) { return C.base + '/play/lesson.html?lesson=' + encodeURIComponent(l.slug) + '&teacher=1&band=' + band; };
      html += '<section class="today" style="margin-top:14px"><h2>' + K.esc(l.character_name) + '</h2><p>' + K.esc(c.cardTagline || '') + '</p>' +
        '<div class="row"><a class="btn btn-sun" href="' + link('explorer') + '">Explorers (5–7)</a><a class="btn btn-sun" href="' + link('trailblazer') + '">Trailblazers (8–11)</a></div>' +
        '<p class="small muted spaced">You will see exactly what the children see, with a few notes just for you and the run sheet. Nothing you do here is saved.</p></section>';
    });

    html += '<h2 class="spaced" style="margin-top:34px">Classes</h2><div class="card">';
    if (!sessions.length) html += '<p class="muted">No classes are scheduled yet.</p>';
    sessions.forEach(function (s) {
      var cl = classes[s.class_id], le = lessonById[s.lesson_id];
      html += '<div class="session"><div><strong>' + K.esc(K.fmtWhen(s.starts_at)) + '</strong><br><span class="small muted">' + K.esc(cl ? cl.name : 'Class') +
        (le ? ' · ' + K.esc(le.character_name) : '') + ' · ' + s.duration_min + ' min · ' + K.esc(s.status) + '</span></div>' +
        '<a class="btn btn-line btn-small" href="' + C.base + '/teacher/class.html?session=' + encodeURIComponent(s.id) + '">Class list</a></div>';
    });
    html += '</div><p class="spaced row">' +
      '<a class="btn btn-line btn-small" href="' + C.base + '/parent/index.html?stay=1">My family</a>' +
      (isAdmin ? '<a class="btn btn-line btn-small" href="' + C.base + '/church-admin/people.html">People and roles</a><a class="btn btn-line btn-small" href="' + C.base + '/church-admin/index.html">Leader tools</a>' : '') + '</p>';
    app.innerHTML = html;
  } catch (e) { K.notice('<h2>Something went wrong</h2><p>' + K.esc(K.explain(e)) + '</p>', 'bad'); }
})();
