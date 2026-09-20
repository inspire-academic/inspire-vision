// Class list for one session: who is in the class, who is here, the meeting link, and the
// leader-awarded badges. Everything is an ordinary database call that row-level security
// only allows for a VETTED teacher (active role + DBS/local check + safeguarding training
// recorded), so an unvetted account simply sees an empty list and an explanation.
(async function () {
  var C = window.KIDS_CONFIG, K = window.KIDS;
  var sid = K.qs('session');
  var session = await K.requireSession();
  if (!session) return;
  K.mountChrome({ signedIn: true, teacher: true });
  var app = document.getElementById('app');
  var cs = await K.cs();
  var me = session.user.id;
  var home = C.base + '/teacher/index.html';
  var STAFF = ['facilitator', 'assistant', 'church_admin', 'safeguarding_lead'];

  if (!sid) return K.notice('<h2>Which class?</h2><p><a href="' + home + '">Choose one from teacher home</a></p>');

  try {
    var sr = await cs.from('sessions').select('id,church_id,class_id,lesson_id,starts_at,duration_min,status,platform').eq('id', sid).maybeSingle();
    if (sr.error) throw sr.error;
    var s = sr.data;
    if (!s) return K.notice('<h2>We couldn’t find that class</h2><p><a href="' + home + '">Back to teacher home</a></p>', 'bad');

    var mem = await cs.from('church_members').select('role,status,dbs_checked_on,safeguarding_trained_on').eq('user_id', me).eq('church_id', s.church_id).in('role', STAFF);
    if (mem.error) throw mem.error;
    var active = (mem.data || []).filter(function (m) { return m.status === 'active'; });
    if (!active.length) return K.notice('<h2>Teachers only</h2><p><a href="' + home + '">Back to teacher home</a></p>', 'bad');
    var vetted = active.some(function (m) { return m.dbs_checked_on && m.safeguarding_trained_on; });

    var r = await Promise.all([
      cs.from('classes').select('id,name').eq('id', s.class_id).maybeSingle(),
      s.lesson_id ? cs.from('lessons').select('character_name').eq('id', s.lesson_id).maybeSingle() : Promise.resolve({ data: null }),
      cs.from('children').select('id,display_name,avatar').eq('class_id', s.class_id).is('archived_at', null).order('display_name'),
      cs.from('attendance').select('child_id,source').eq('session_id', sid),
      cs.from('badges').select('key,title,awarded_by'),
      cs.from('awards').select('child_id,badge_key'),
      cs.rpc('get_join_info', { p_session: sid })
    ]);
    var cls = r[0].data, lesson = r[1].data, kids = r[2].data || [], present = {}, allBadges = r[4].data || [], awards = r[5].data || [];
    var leaderBadges = allBadges.filter(function (b) { return b.awarded_by === 'leader'; });    // the ones a teacher may give
    (r[3].data || []).forEach(function (a) { present[a.child_id] = a.source; });
    var joinInfo = !r[6].error && (r[6].data || [])[0];
    var badgeTitle = {}; allBadges.forEach(function (b) { badgeTitle[b.key] = b.title; });      // titles for everything already earned
    var earned = {};
    awards.forEach(function (a) { (earned[a.child_id] = earned[a.child_id] || []).push(a.badge_key); });

    render();

    function render(flash) {
      var html = '<h1>' + K.esc(cls ? cls.name : 'Class') + '</h1><p class="lede">' + K.esc(K.fmtWhen(s.starts_at)) + ' · ' + s.duration_min + ' minutes' +
        (lesson ? ' · ' + K.esc(lesson.character_name) : '') + '</p>';
      if (flash) html += '<div class="card notice good" role="status">' + K.esc(flash) + '</div>';

      html += '<div class="card"><h2>Meeting</h2>';
      if (joinInfo && /^https:\/\//i.test(joinInfo.join_url)) {
        html += '<p><a class="btn btn-sun" target="_blank" rel="noopener noreferrer" href="' + K.esc(joinInfo.join_url) + '">Open ' + (s.platform === 'teams' ? 'Teams' : 'Zoom') + '</a></p>' +
          (joinInfo.meeting_id ? '<p class="small">Meeting ID <code>' + K.esc(joinInfo.meeting_id) + '</code></p>' : '') +
          (joinInfo.passcode ? '<p class="small">Passcode <code>' + K.esc(joinInfo.passcode) + '</code></p>' : '') +
          '<p class="small muted">Two vetted adults in every class. Admit children one by one from the waiting room.</p>';
      } else {
        html += '<p class="muted">The meeting link appears here from ' + C.joinOpensMinutesBefore + ' minutes before class, for teachers whose checks are recorded.</p>';
      }
      html += '</div>';

      html += '<div class="card"><h2>Class list</h2>';
      if (!vetted) {
        html += '<p>Class lists stay hidden until your DBS check (or local equivalent) and safeguarding training are recorded. Ask your church admin.</p>';
      } else if (!kids.length) {
        html += '<p class="muted">No children are in this class yet.</p>';
      } else {
        html += '<p class="small muted" style="margin-bottom:14px">First names only. Mark a child present if they joined and you have seen them. Families can also check themselves in.</p>';
        kids.forEach(function (k) {
          var src = present[k.id];
          html += '<div class="here" data-kid="' + K.esc(k.id) + '"><div class="av">' + K.avatarSvg(k.avatar, '') + '</div>' +
            '<div style="flex:1"><strong style="display:block">' + K.esc(k.display_name) + '</strong>' +
            '<span class="small ' + (src ? 'tick' : 'muted') + '">' + (src ? '✓ Here' + (src === 'self_checkin' ? ' (family checked in)' : '') : 'Not marked yet') + '</span>' +
            ((earned[k.id] || []).length ? '<br><span class="small muted">Badges: ' + K.esc(earned[k.id].map(function (b) { return badgeTitle[b] || b; }).join(', ')) + '</span>' : '') + '</div>' +
            '<div class="row">' + (src === 'leader' || !src
              ? '<button type="button" class="btn btn-line btn-small" data-toggle="' + K.esc(k.id) + '">' + (src === 'leader' ? 'Undo' : 'Mark present') + '</button>' : '') +
            '<select data-badge="' + K.esc(k.id) + '" aria-label="Badge for ' + K.esc(k.display_name) + '"><option value="">Give a badge…</option>' +
              leaderBadges.filter(function (b) { return (earned[k.id] || []).indexOf(b.key) < 0; }).map(function (b) { return '<option value="' + K.esc(b.key) + '">' + K.esc(b.title) + '</option>'; }).join('') + '</select></div></div>';
        });
      }
      html += '</div><p class="spaced"><a class="btn btn-line btn-small" href="' + home + '">Back to teacher home</a></p>';
      app.innerHTML = html;
      wire();
    }

    function wire() {
      Array.prototype.forEach.call(app.querySelectorAll('[data-toggle]'), function (b) {
        b.addEventListener('click', async function () {
          var id = b.dataset.toggle; b.disabled = true;
          var res = present[id] === 'leader'
            ? await cs.from('attendance').delete().eq('session_id', sid).eq('child_id', id)
            : await cs.from('attendance').insert({ session_id: sid, child_id: id, source: 'leader' });
          if (res.error && res.error.code !== '23505') { b.disabled = false; return render('That didn’t save: ' + K.explain(res.error)); }
          if (present[id] === 'leader') delete present[id]; else present[id] = 'leader';
          render();
        });
      });
      Array.prototype.forEach.call(app.querySelectorAll('[data-badge]'), function (sel) {
        sel.addEventListener('change', async function () {
          if (!sel.value) return;
          var id = sel.dataset.badge, key = sel.value; sel.disabled = true;
          var res = await cs.rpc('award_badge_by_leader', { p_child: id, p_badge: key, p_session: sid });
          if (res.error) { return render('That didn’t save: ' + K.explain(res.error)); }
          (earned[id] = earned[id] || []).push(key);
          render((badgeTitle[key] || 'Badge') + ' given.');
        });
      });
    }
  } catch (e) { K.notice('<h2>Something went wrong</h2><p>' + K.esc(K.explain(e)) + '</p>', 'bad'); }
})();
