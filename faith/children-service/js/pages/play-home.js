// A child's home: today's adventure, the Bible map, badges and character
// cards. It runs inside the PARENT's signed-in session (children have no
// login), and only ever loads a child that belongs to that parent.
(async function () {
  var C = window.KIDS_CONFIG, K = window.KIDS;
  var childId = K.qs('child');
  var session = await K.requireSession();
  if (!session) return;
  K.mountChrome({ signedIn: true });
  var app = document.getElementById('app');
  var cs = await K.cs();
  var home = C.base + '/parent/index.html';

  if (!childId) return K.notice('<h2>Who’s playing?</h2><p><a href="' + home + '">Choose from your family page</a></p>');

  // The eight stops on the Bible storyline map. A lesson unlocks a stop via character.mapStop.
  var STOPS = [
    ['creation', 'Creation'], ['abraham', 'Abraham’s family'], ['exodus', 'Escape from Egypt'], ['judges', 'Judges and heroes'],
    ['kings', 'Kings'], ['exile', 'Exile and home'], ['jesus', 'Jesus'], ['church', 'The Church']
  ];
  var STEPS = [['mystery', 'Mystery'], ['story', 'Story'], ['quiz', 'Quiz'], ['verse', 'Verse'], ['reflect', 'Reflect']];
  var CORE = ['mystery', 'story', 'quiz', 'verse'];

  try {
    var cr = await cs.from('children').select('id,display_name,age_band,avatar').eq('id', childId).eq('parent_id', session.user.id).maybeSingle();
    if (cr.error) throw cr.error;
    if (!cr.data) return K.notice('<h2>We couldn’t find that explorer</h2><p><a href="' + home + '">Back to my family</a></p>', 'bad');
    var child = cr.data;

    var res = await Promise.all([
      cs.from('lessons').select('id,slug,character_name,sequence,content').eq('status', 'published').order('sequence'),
      cs.from('progress').select('lesson_id,step_key').eq('child_id', childId),
      cs.from('awards').select('badge_key').eq('child_id', childId),
      cs.from('badges').select('key,title,description')
    ]);
    res.forEach(function (r) { if (r.error) throw r.error; });
    var lessons = res[0].data || [], progress = res[1].data || [], awards = res[2].data || [], badges = res[3].data || [];

    var done = {};   // lesson_id -> {step:true}
    progress.forEach(function (p) { (done[p.lesson_id] = done[p.lesson_id] || {})[p.step_key] = true; });
    var earned = {};
    awards.forEach(function (a) { earned[a.badge_key] = true; });

    function isMet(l) { var d = done[l.id] || {}; return CORE.every(function (k) { return d[k]; }); }
    var today = lessons.filter(function (l) { return !isMet(l); })[0] || lessons[lessons.length - 1];

    var html = '<div class="hero-kid"><div class="av">' + K.avatarSvg(child.avatar, child.display_name + '’s avatar') + '</div>' +
      '<div><h1>Hi, ' + K.esc(child.display_name) + '!</h1><p class="lede">Ready for an adventure?</p></div></div>';

    if (today) {
      var d = done[today.id] || {};
      html += '<section class="today"><h2>' + (isMet(today) ? 'Play again: ' : 'Today: ') + K.esc(today.character_name) + '</h2>' +
        '<p>' + K.esc((today.content.character && today.content.character.cardTagline) || '') + '</p><div class="steps-row" aria-label="Adventure steps">' +
        STEPS.map(function (s) { return '<span class="' + (d[s[0]] ? 'done' : '') + '">' + (d[s[0]] ? '✓ ' : '') + s[1] + '</span>'; }).join('') + '</div>' +
        '<a class="btn btn-sun" href="' + C.base + '/play/lesson.html?lesson=' + encodeURIComponent(today.slug) + '&child=' + encodeURIComponent(childId) + '">' +
        (Object.keys(d).length ? (isMet(today) ? 'Play again' : 'Keep going') : 'Start the adventure') + '</a></section>';
    } else {
      html += '<section class="today"><h2>No adventures yet</h2><p>New Bible characters will appear here soon.</p></section>';
    }

    var unlocked = {};
    lessons.forEach(function (l) { if (isMet(l) && l.content.character && l.content.character.mapStop) unlocked[l.content.character.mapStop] = l.character_name; });
    html += '<h2 class="spaced" style="margin-top:34px">Your Bible map</h2><div class="pathmap" role="list">' +
      STOPS.map(function (s, i) {
        var open = !!unlocked[s[0]];
        return '<div class="stop ' + (open ? 'open' : '') + '" role="listitem"><div class="dot">' + (i + 1) + '</div><span>' + K.esc(s[1]) + (open ? '<br>' + K.esc(unlocked[s[0]]) + ' ✓' : '') + '</span></div>';
      }).join('') + '</div>';

    var have = badges.filter(function (b) { return earned[b.key]; });
    var locked = badges.length - have.length;
    var lockedTiles = '';
    for (var i = 0; i < locked; i++) {
      lockedTiles += '<div class="bdg locked">' + K.badgeSvg('', true) + '<strong>Mystery badge</strong><small>Keep exploring to find it!</small></div>';
    }
    html += '<h2 class="spaced" style="margin-top:20px">Your badges</h2><div class="shelf">' +
      have.map(function (b) { return '<div class="bdg">' + K.badgeSvg(b.key) + '<strong>' + K.esc(b.title) + '</strong><small>' + K.esc(b.description) + '</small></div>'; }).join('') +
      lockedTiles + '</div>';
    if (!have.length) html += '<p class="muted spaced">Finish an adventure to earn your first badge.</p>';

    var met = lessons.filter(isMet);
    if (met.length) {
      html += '<h2 class="spaced" style="margin-top:34px">Characters you’ve met</h2><div class="row">' + met.map(function (l) {
        var c = l.content.character || {}, mv = (l.content.live && l.content.live.memoryVerse) || {};
        return '<div class="cardface"><div class="who">' + K.esc(l.character_name) + '</div><div class="tag">' + K.esc(c.cardTagline || '') + '</div>' +
          (mv.ref ? '<div class="verse">' + K.esc(mv.ref) + '</div>' : '') + '</div>';
      }).join('') + '</div>';
    }
    app.innerHTML = html;
  } catch (e) { K.notice('<h2>Something went wrong</h2><p>' + K.esc(K.explain(e)) + '</p>', 'bad'); }
})();
