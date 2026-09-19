// Family home. Three gates, in order:
//   1. consent   — recorded, versioned, before anything else
//   2. membership — ask to join the church; a church_admin approves
//   3. family     — children, and upcoming classes to join
(async function () {
  var C = window.KIDS_CONFIG, K = window.KIDS;
  var session = await K.requireSession();
  if (!session) return;
  K.mountChrome({ signedIn: true });

  var app = document.getElementById('app');
  var cs = await K.cs();
  var me = session.user.id;
  var firstName = (session.user.user_metadata && session.user.user_metadata.full_name) || '';

  try { await route(); }
  catch (e) { K.notice('<h2>Something went wrong</h2><p>' + K.esc(K.explain(e)) + '</p>', 'bad'); }

  async function route() {
    var cr = await cs.from('consents').select('type,given,created_at')
      .is('child_id', null).in('type', ['data_processing', 'safeguarding_policy'])
      .order('created_at', { ascending: false });
    if (cr.error) throw cr.error;
    var latest = {};
    (cr.data || []).forEach(function (r) { if (!(r.type in latest)) latest[r.type] = r.given; });
    if (!(latest.data_processing && latest.safeguarding_policy)) return renderConsent();

    var ch = await cs.rpc('church_by_slug', { p_slug: C.churchSlug });
    if (ch.error) throw ch.error;
    var church = (ch.data || [])[0];
    if (!church) return K.notice('<h2>Not open yet</h2><p>Bible Explorers isn’t taking new families right now.</p>');

    var mem = await cs.from('church_members').select('id,status').eq('user_id', me).eq('role', 'parent').eq('church_id', church.id);
    if (mem.error) throw mem.error;
    var m = (mem.data || [])[0];
    if (!m) return renderAsk(church);
    if (m.status === 'pending') return renderPending(church);
    if (m.status !== 'active') return K.notice('<h2>Your account is paused</h2><p>Please speak to a leader at ' + K.esc(church.name) + '.</p>', 'bad');
    return renderFamily(church);
  }

  function renderConsent() {
    app.innerHTML =
      '<h1>Before we start</h1>' +
      '<p class="lede">Bible Explorers is a Christian Bible class for children. Here is exactly what we keep, and why.</p>' +
      '<form class="card" id="consent" novalidate>' +
      '<h2>What we keep</h2><ul class="rules-list"><li>Your child’s <b>first name or nickname</b> and the <b>cartoon avatar</b> you choose.</li>' +
      '<li>Which classes they join, and their progress and badges.</li></ul>' +
      '<p class="spaced"><b>We never keep</b> a surname, photo, age, school or address. Children cannot chat, message or upload anything.</p>' +
      '<hr style="border:0;border-top:2px solid #efe3c8;margin:20px 0">' +
      '<label class="check"><input type="checkbox" id="c1"><span>I agree that Inspire may store my child’s first name or nickname, avatar, class attendance and progress so Bible Explorers can run. I understand this shows my child takes part in a Christian class, and that I can remove my child’s information at any time.</span></label>' +
      '<label class="check"><input type="checkbox" id="c2"><span>I understand that a grown-up must be nearby whenever my child is online in class, that classes are led by two vetted adults, and that I should tell a leader about anything that worries me.</span></label>' +
      '<p class="err" id="cerr" role="alert"></p>' +
      '<button class="btn btn-sun" type="submit" id="cgo">I agree, continue</button>' +
      '<p class="small muted spaced">This is our interim wording. Our full privacy and safeguarding policy will be published before the first class runs.</p>' +
      '</form>';
    document.getElementById('consent').addEventListener('submit', async function (e) {
      e.preventDefault();
      var err = document.getElementById('cerr');
      if (!document.getElementById('c1').checked || !document.getElementById('c2').checked) {
        err.textContent = 'Please tick both boxes to continue.'; return;
      }
      var btn = document.getElementById('cgo'); btn.disabled = true;
      var res = await cs.from('consents').insert([
        { parent_id: me, child_id: null, type: 'data_processing', policy_version: C.policyVersion, given: true },
        { parent_id: me, child_id: null, type: 'safeguarding_policy', policy_version: C.policyVersion, given: true }
      ]);
      if (res.error) { err.textContent = K.explain(res.error); btn.disabled = false; return; }
      route().catch(function (ex) { K.notice('<h2>Something went wrong</h2><p>' + K.esc(K.explain(ex)) + '</p>', 'bad'); });
    });
  }

  function renderAsk(church) {
    app.innerHTML =
      '<h1>Welcome' + (firstName ? ', ' + K.esc(firstName) : '') + '!</h1>' +
      '<div class="card"><h2>Join ' + K.esc(church.name) + '</h2>' +
      '<p>A leader will check and approve every family before children can join, so we know who is in our class.</p>' +
      '<p class="err" id="jerr" role="alert"></p>' +
      '<button class="btn btn-sun" id="ask" type="button">Ask to join</button></div>';
    document.getElementById('ask').addEventListener('click', async function () {
      this.disabled = true;
      var res = await cs.from('church_members').insert({ church_id: church.id, user_id: me, role: 'parent', status: 'pending', display_name: firstName || null });
      if (res.error) { document.getElementById('jerr').textContent = K.explain(res.error); this.disabled = false; return; }
      renderPending(church);
    });
  }

  function renderPending(church) {
    app.innerHTML =
      '<h1>Thank you' + (firstName ? ', ' + K.esc(firstName) : '') + '!</h1>' +
      '<div class="card notice good"><h2>Waiting for a leader to approve you</h2>' +
      '<p>Your request to join <b>' + K.esc(church.name) + '</b> has been sent. As soon as a leader approves it you can add your children here.</p>' +
      '<button class="btn btn-line btn-small spaced" id="again" type="button">Check again</button></div>';
    document.getElementById('again').addEventListener('click', function () { location.reload(); });
  }

  async function renderFamily(church) {
    var kr = await cs.from('children').select('id,display_name,age_band,avatar,class_id').eq('parent_id', me).is('archived_at', null).order('created_at');
    if (kr.error) throw kr.error;
    var kids = kr.data || [];
    var sr = await cs.from('sessions').select('id,class_id,starts_at,duration_min,status,platform,lesson_id')
      .in('status', ['scheduled', 'live']).order('starts_at').limit(10);
    if (sr.error) throw sr.error;
    var now = Date.now(), slack = C.joinOpensMinutesBefore * 60000;
    var sessions = (sr.data || []).filter(function (s) { return new Date(s.starts_at).getTime() + s.duration_min * 60000 + slack > now; });

    var html = '<h1>' + (firstName ? 'Hello, ' + K.esc(firstName) + '!' : 'My family') + '</h1>' +
      '<p class="lede">' + K.esc(church.name) + '</p>';

    html += '<h2>Your explorers</h2><div class="kids-grid spaced">';
    kids.forEach(function (k) {
      html += '<article class="kid"><div class="av">' + K.avatarSvg(k.avatar, k.display_name + '’s avatar') + '</div>' +
        '<h3>' + K.esc(k.display_name) + '</h3><p class="band">' + K.esc(K.bandLabel(k.age_band)) + (k.class_id ? '' : '<br><em>Waiting for a class</em>') + '</p>' +
        '<div class="row"><a class="btn btn-sun btn-small" href="' + C.base + '/play/home.html?child=' + encodeURIComponent(k.id) + '">Play</a>' +
        '<a class="btn btn-line btn-small" href="' + C.base + '/parent/child.html?id=' + encodeURIComponent(k.id) + '">Edit</a></div></article>';
    });
    html += '<a class="kid add" href="' + C.base + '/parent/child.html"><div><b aria-hidden="true">+</b><span>Add a child</span></div></a></div>';

    html += '<div class="card spaced" id="classes"><h2>Upcoming classes</h2>';
    var rows = '';
    sessions.forEach(function (s) {
      var inClass = kids.filter(function (k) { return k.class_id === s.class_id; });
      if (!inClass.length) return;
      rows += '<div class="session"><div><strong>' + K.esc(K.fmtWhen(s.starts_at)) + '</strong><br>' +
        inClass.map(function (k) { return '<span class="mini-av">' + K.avatarSvg(k.avatar, '') + '</span>' + K.esc(k.display_name); }).join(' &nbsp; ') +
        '<br><span class="small muted">' + s.duration_min + ' minutes on ' + (s.platform === 'teams' ? 'Teams' : 'Zoom') + '</span></div>' +
        '<a class="btn btn-sun btn-small" href="' + C.base + '/class/join.html?session=' + encodeURIComponent(s.id) + '">Join class</a></div>';
    });
    html += rows || '<p class="muted">No classes are scheduled for your children yet. When a leader adds one it will appear here.</p>';
    html += '</div>';
    // Church admins get a shortcut to the leader tools. (Just a link: the tools themselves are protected by the database.)
    var ar = await cs.from('church_members').select('id').eq('user_id', me).eq('role', 'church_admin').eq('status', 'active').eq('church_id', church.id);
    if (!ar.error && (ar.data || []).length) html += '<p class="spaced"><a class="btn btn-line btn-small" href="' + C.base + '/church-admin/index.html">Leader tools</a></p>';
    app.innerHTML = html;
  }
})();
