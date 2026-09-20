// Class-join page.
//  * Each child taps "I'm here" (records attendance, may earn Camp Fire Friend).
//  * The Zoom link and passcode are NEVER on the page until the server
//    releases them: get_join_info() only answers from 30 minutes before the
//    class starts until 30 minutes after it should end, and only for a parent
//    with a child in this class. The page polls it every 30 seconds.
(async function () {
  var C = window.KIDS_CONFIG, K = window.KIDS;
  var sid = K.qs('session');
  var session = await K.requireSession();
  if (!session) return;
  K.mountChrome({ signedIn: true });
  var app = document.getElementById('app');
  var cs = await K.cs();
  var me = session.user.id;
  var home = C.base + '/parent/index.html';
  var timer = null;

  if (!sid) return K.notice('<h2>Which class?</h2><p><a href="' + home + '">Choose one from your family page</a></p>');

  try {
    var sr = await cs.from('sessions').select('id,class_id,starts_at,duration_min,status,platform,lesson_id').eq('id', sid).maybeSingle();
    if (sr.error) throw sr.error;
    var s = sr.data;
    if (!s) return K.notice('<h2>We couldn’t find that class</h2><p><a href="' + home + '">Back to my family</a></p>', 'bad');

    var kr = await cs.from('children').select('id,display_name,avatar').eq('parent_id', me).eq('class_id', s.class_id).is('archived_at', null).order('created_at');
    if (kr.error) throw kr.error;
    var kids = kr.data || [];
    if (!kids.length) return K.notice('<h2>None of your children are in this class</h2><p><a href="' + home + '">Back to my family</a></p>', 'bad');

    var ar = await cs.from('attendance').select('child_id').eq('session_id', sid);
    if (ar.error) throw ar.error;
    var here = {};
    (ar.data || []).forEach(function (a) { here[a.child_id] = true; });

    var lesson = null;
    if (s.lesson_id) {
      var lr = await cs.from('lessons').select('slug,character_name').eq('id', s.lesson_id).maybeSingle();
      if (!lr.error) lesson = lr.data;
    }
    render(s, kids, here, lesson);
    poll(s);
  } catch (e) { K.notice('<h2>Something went wrong</h2><p>' + K.esc(K.explain(e)) + '</p>', 'bad'); }

  function windowState(s) {
    var start = new Date(s.starts_at).getTime(), now = Date.now();
    var opens = start - C.joinOpensMinutesBefore * 60000;
    var closes = start + s.duration_min * 60000 + C.joinStaysOpenMinutesAfter * 60000;
    if (s.status === 'cancelled') return 'cancelled';
    if (s.status === 'ended' || now > closes) return 'over';
    return now < opens ? 'early' : 'open';
  }

  function render(s, kids, here, lesson) {
    var html = '<h1>Class on ' + K.esc(K.fmtWhen(s.starts_at)) + '</h1>' +
      '<p class="lede">' + s.duration_min + ' minutes on ' + (s.platform === 'teams' ? 'Teams' : 'Zoom') + '</p>';

    html += '<div class="card"><h2>Who’s joining?</h2>';
    kids.forEach(function (k) {
      html += '<div class="here"><div class="av">' + K.avatarSvg(k.avatar, '') + '</div><strong>' + K.esc(k.display_name) + '</strong>' +
        (here[k.id] ? '<span class="tick" data-here="' + k.id + '">✓ Checked in</span>'
                    : '<button type="button" class="btn btn-sun btn-small" data-checkin="' + k.id + '">I’m here!</button>') + '</div>';
    });
    html += '<p class="small muted">Tap when your child is sitting down and ready. It helps the leaders know who to expect.</p>';
    html += '<div id="newbadge"></div></div>';

    if (lesson && lesson.slug) {
      html += '<div class="card"><h2>Warm-up: who is ' + K.esc(lesson.character_name) + '?</h2>' +
        '<p>Solve the mystery clues before class starts.</p><div class="row">' +
        kids.map(function (k) {
          return '<a class="btn btn-line btn-small" href="' + C.base + '/play/lesson.html?lesson=' + encodeURIComponent(lesson.slug) + '&child=' + encodeURIComponent(k.id) + '&only=mystery">' + K.esc(k.display_name) + '’s mystery</a>';
        }).join('') + '</div></div>';
    }

    html += '<div class="card" id="zoom"></div>';
    html += '<div class="card"><h2>Before you join</h2><ul class="rules-list">' +
      '<li>A grown-up stays nearby, ideally in the same room.</li>' +
      '<li>Join from a shared space, not a bedroom, with the camera on your child’s face and a plain background.</li>' +
      '<li>Children use first names only. Cameras are optional, and nobody has to speak.</li>' +
      '<li>Two leaders are always in the room. If anything feels wrong, leave the meeting and tell a leader.</li></ul></div>';
    app.innerHTML = html;

    Array.prototype.forEach.call(app.querySelectorAll('[data-checkin]'), function (b) {
      b.addEventListener('click', function () { checkIn(b, s, kids); });
    });
    showZoom(s, null);
  }

  async function checkIn(btn, s, kids) {
    var id = btn.dataset.checkin;
    btn.disabled = true;
    var res = await cs.from('attendance').insert({ session_id: s.id, child_id: id, source: 'self_checkin' });
    if (res.error && res.error.code !== '23505') { btn.disabled = false; btn.textContent = 'Try again'; return; }
    btn.outerHTML = '<span class="tick">✓ Checked in</span>';
    var ev = await cs.rpc('evaluate_badges', { p_child: id });
    if (!ev.error && (ev.data || []).length) {
      var keys = ev.data.map(function (r) { return r.new_badge; });
      var br = await cs.from('badges').select('key,title,description').in('key', keys);
      var box = document.getElementById('newbadge');
      (br.data || []).forEach(function (b) {
        box.insertAdjacentHTML('beforeend', '<div class="badge-pop show" style="display:flex">' + K.badgeSvg(b.key) + '<p><strong>' + K.esc(b.title) + '</strong>' + K.esc(b.description) + '</p></div>');
      });
    }
  }

  // info = {join_url, meeting_id, passcode} once released, else null
  function showZoom(s, info) {
    var box = document.getElementById('zoom');
    var st = windowState(s);
    var name = s.platform === 'teams' ? 'Teams' : 'Zoom';
    if (info && /^https:\/\//i.test(info.join_url)) {
      // Inside the short grace period after the scheduled end the link still works
      // (a class may overrun), but don't call it "open" when the time is up.
      var ended = Date.now() > new Date(s.starts_at).getTime() + s.duration_min * 60000;
      box.innerHTML = '<h2>Join the class</h2><div class="zoombox"><p class="big">' + (ended ? 'The class time is over' : 'The class is open') + '</p>' +
        (ended ? '<p class="small muted">The meeting may still be running if the class is finishing late.</p>' : '') +
        '<p><a class="btn btn-sun" target="_blank" rel="noopener noreferrer" href="' + K.esc(info.join_url) + '">Open ' + name + '</a></p>' +
        (info.meeting_id ? '<p class="small">Meeting ID <code>' + K.esc(info.meeting_id) + '</code></p>' : '') +
        (info.passcode ? '<p class="small">Passcode <code>' + K.esc(info.passcode) + '</code></p>' : '') +
        '<p class="small muted">You will wait in a waiting room until a leader lets you in. Please don’t share this link.</p></div>';
      return;
    }
    if (st === 'early') {
      var opens = new Date(new Date(s.starts_at).getTime() - C.joinOpensMinutesBefore * 60000);
      box.innerHTML = '<h2>Join the class</h2><div class="zoombox"><p class="big">Not open yet</p><p>The ' + name + ' link appears at <b>' +
        K.esc(opens.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) + '</b>, ' + C.joinOpensMinutesBefore + ' minutes before class. Keep this page open and it will show up by itself.</p></div>';
    } else if (st === 'over') {
      box.innerHTML = '<h2>This class has finished</h2><p class="muted">Thanks for joining. Look out for the next one on your family page.</p>';
    } else if (st === 'cancelled') {
      box.innerHTML = '<h2>This class has been cancelled</h2><p class="muted">Please check your family page for the next one.</p>';
    } else {
      box.innerHTML = '<h2>Join the class</h2><div class="zoombox"><p class="big">Getting the link…</p><p class="small muted">If it doesn’t appear, ask a leader to check that the class details have been set up.</p></div>';
    }
  }

  function poll(s) {
    async function tick() {
      var st = windowState(s);
      if (st === 'over' || st === 'cancelled') { showZoom(s, null); return; }
      if (st === 'open') {
        var r = await cs.rpc('get_join_info', { p_session: s.id });
        var info = !r.error && (r.data || [])[0];
        if (info) { showZoom(s, info); return; }   // released: stop polling
      }
      showZoom(s, null);
      timer = setTimeout(tick, 30000);
    }
    tick();
  }

  window.addEventListener('pagehide', function () { if (timer) clearTimeout(timer); });
})();
