// Lesson player: mystery -> story -> quiz -> memory verse -> reflect -> finish.
// Driven entirely by the lesson JSON (see content/lesson-schema.md).
//  * With ?child=<id> it runs inside the parent's signed-in session, loads
//    the lesson from the database, saves a progress row per step and asks
//    the server to award any earned badges.
//  * Without ?child (or if the lesson isn't in the database yet) it runs in
//    PRACTICE mode from the static JSON file: nothing is saved, no account
//    needed. That is also how a lesson author previews their work.
//  * Children never type anything: every answer is a tap on a fixed option.
(async function () {
  var C = window.KIDS_CONFIG, K = window.KIDS;
  var slug = K.qs('lesson'), childId = K.qs('child'), only = K.qs('only');
  var app = document.getElementById('app');
  var home = C.base + '/parent/index.html';
  var childHome = C.base + '/play/home.html?child=' + encodeURIComponent(childId || '');

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return K.notice('<h2>Which adventure?</h2><p><a href="' + home + '">Choose one from your family page</a></p>');

  var cs = null, child = null, lesson = null, lessonId = null, practice = !childId;
  var band = K.qs('band') === 'trailblazer' ? 'trailblazer' : 'explorer', doneSteps = {}, badgeInfo = {}, cur = 0;
  // Teacher view: the SAME player a child sees (same look, same steps), with small "For the
  // teacher" notes and a run-sheet added. Only honoured for a signed-in active teacher / leader,
  // it never saves anything, and it reads the latest lesson file (so a draft can be reviewed).
  var teacher = false;
  var steps = only === 'mystery' ? ['mystery'] : ['mystery', 'story', 'quiz', 'verse', 'belong', 'reflect'];

  try {
    if (childId) {
      var session = await K.requireSession();
      if (!session) return;
      K.mountChrome({ signedIn: true });
      cs = await K.cs();
      var cr = await cs.from('children').select('id,display_name,age_band').eq('id', childId).eq('parent_id', session.user.id).maybeSingle();
      if (cr.error) throw cr.error;
      if (!cr.data) return K.notice('<h2>We couldn’t find that explorer</h2><p><a href="' + home + '">Back to my family</a></p>', 'bad');
      child = cr.data; band = child.age_band;
      var lr = await cs.from('lessons').select('id,content').eq('slug', slug).eq('status', 'published').limit(1);
      if (lr.error) throw lr.error;
      if (lr.data && lr.data[0]) {
        lesson = lr.data[0].content; lessonId = lr.data[0].id;
        var pr = await cs.from('progress').select('step_key').eq('child_id', childId).eq('lesson_id', lessonId);
        (pr.data || []).forEach(function (p) { doneSteps[p.step_key] = true; });
        var br = await cs.from('badges').select('key,title,description');
        (br.data || []).forEach(function (b) { badgeInfo[b.key] = b; });
      }
    } else {
      var sess = await K.session();
      if (K.qs('teacher') === '1' && sess) {
        var tcs = await K.cs();
        var tr = await tcs.from('church_members').select('role').eq('user_id', sess.user.id).eq('status', 'active')
          .in('role', ['facilitator', 'assistant', 'church_admin', 'safeguarding_lead']);
        teacher = !tr.error && (tr.data || []).length > 0;
      }
      K.mountChrome({ signedIn: !!sess, teacher: teacher });
    }
    if (!lesson) {
      var f = await fetch(C.base + '/content/lessons/' + slug + '.json');
      if (!f.ok) return K.notice('<h2>That adventure isn’t ready yet</h2><p><a href="' + home + '">Back to my family</a></p>');
      lesson = await f.json();
      practice = true;
    }
  } catch (e) { return K.notice('<h2>Something went wrong</h2><p>' + K.esc(K.explain(e)) + '</p>', 'bad'); }

  document.title = lesson.character.name + ' — Bible Explorers';
  var first = steps.findIndex(function (s) { return !doneSteps[s]; });
  cur = practice || first < 0 ? 0 : first;
  drawShell();
  runStep();

  // ---------- helpers ----------
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  // ---------- names in the life-application scenarios ----------
  // Scenarios use tokens such as {boy1} and {girl2}. They resolve to names from the
  // lesson's own pool, the same way every time for the same child (a reload shows
  // the same names), and NEVER to the child's own name: a real child must not meet
  // "themselves" as the one who is left out or laughed at.
  function hashSeed(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function seededOrder(list, seed) {
    var a = list.slice(), s = seed || 1;
    function rnd() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  // Characters ALTERNATE between non-African and African names, in the order they first
  // appear in the lesson (e.g. Jason, then Kweku, then Alfie, then Adjoa...), so a lesson
  // never reads as all one heritage. The pool lists both origins for each gender.
  function tokenOrder() {
    var seen = [];
    ['story.part1', 'story.part2', 'quiz', 'verse'].forEach(function (a) {
      momentsFor(a).forEach(function (m) {
        var blob = [m.title, m.scenario, m.question].concat(m.choices.map(function (c) { return c.text + ' ' + c.response; }), [m.grownUpTalk]).join(' ');
        (blob.match(/\{(?:boy|girl)\d+\}/g) || []).forEach(function (t) { if (seen.indexOf(t) < 0) seen.push(t); });
      });
    });
    return seen;
  }
  var nameMap = null;
  function buildNames() {
    var pool = lesson.names || {}, own = child ? String(child.display_name).toLowerCase() : '';
    var seed = hashSeed((childId || 'practice') + ':' + slug + ':' + band);
    var used = {}, map = {};
    function origins(g) {                                   // tolerate an older flat list
      var p = pool[g];
      return Array.isArray(p) ? { other: p, african: [] } : { other: (p && p.other) || [], african: (p && p.african) || [] };
    }
    tokenOrder().forEach(function (tok, k) {
      var g = tok.indexOf('{girl') === 0 ? 'girl' : 'boy', o = origins(g);
      var want = k % 2 === 0 ? 'other' : 'african', alt = want === 'other' ? 'african' : 'other';
      function free(list) { return list.filter(function (x) { return x.toLowerCase() !== own && !used[x]; }); }
      var candidates = free(o[want]);
      if (!candidates.length) candidates = free(o[alt]);                       // pool too small for strict alternation
      if (!candidates.length) candidates = o[want].concat(o[alt]).filter(function (x) { return x.toLowerCase() !== own; });
      if (!candidates.length) candidates = ['a friend'];
      var pick = seededOrder(candidates, seed + k * 31)[0];
      used[pick] = true; map[tok] = pick;
    });
    return map;
  }
  function fill(text) {
    if (!nameMap) nameMap = buildNames();
    return String(text == null ? '' : text).replace(/\{(?:boy|girl)\d+\}/g, function (tok) { return nameMap[tok] || 'a friend'; });
  }

  // ---------- "Think about it" life-application moments ----------
  // Placed where the story meets a child's week (see lesson "apply"). Each choice gets
  // a kind reply and a prompt to talk with a grown-up. Nothing tapped here is saved.
  function momentsFor(anchor) {
    return ((lesson.apply && lesson.apply.moments) || []).filter(function (m) { return m.after === anchor && m.bands.indexOf(band) >= 0; });
  }
  function momentHtml(m) {
    return '<div class="q-count"><span class="moment-tag">Think about it</span></div><h2>' + K.esc(fill(m.title)) + '</h2>' +
      '<p class="story">' + K.esc(fill(m.scenario)) + '</p><p class="story"><b>' + K.esc(fill(m.question)) + '</b></p>' +
      '<div class="choices">' + m.choices.map(function (c, i) {
        return '<button type="button" class="choice" data-mi="' + i + '">' + K.esc(fill(c.text)) + '</button>';
      }).join('') + '</div><div id="mresp" aria-live="polite"></div>' + momentNote(m);
  }
  function wireMoment(stage, m) {
    Array.prototype.forEach.call(stage.querySelectorAll('[data-mi]'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(stage.querySelectorAll('[data-mi]'), function (x) { x.classList.remove('picked'); });
        b.classList.add('picked');
        var c = m.choices[parseInt(b.dataset.mi, 10)];
        document.getElementById('mresp').innerHTML = '<blockquote class="quote">' + K.esc(fill(c.response)) + '</blockquote>' +
          '<p class="small muted">' + K.esc(fill(m.grownUpTalk)) + '</p>';
      });
    });
  }
  function momentSpeech(m) { return fill(m.scenario) + ' ' + fill(m.question); }
  // Run every moment attached to an anchor (e.g. after the quiz), then carry on.
  function runMoments(anchor, done) {
    var list = momentsFor(anchor), i = 0, stage = document.getElementById('stage');
    if (!list.length) return done();
    draw();
    function draw() {
      var m = list[i];
      stage.innerHTML = momentHtml(m) + '<div class="nav-row"><div class="row">' + readBtn() + '</div><button type="button" class="btn btn-sun" id="nx">Keep going</button></div>';
      wireRead(momentSpeech(m)); wireMoment(stage, m);
      document.getElementById('nx').addEventListener('click', function () { stopSpeech(); if (++i < list.length) draw(); else done(); });
      stage.focus({ preventScroll: true });
    }
  }

  // Split a passage into story cards of a few sentences each: shorter cards
  // for Explorers (pre-readers, read aloud), longer for Trailblazers.
  function chunk(text) {
    var max = band === 'explorer' ? 150 : 260;
    var sentences = text.match(/[^.!?]+[.!?]+["”’']*\s*/g) || [];
    var rest = text.slice(sentences.join('').length).trim();
    if (rest) sentences.push(rest);
    var out = [], acc = '';
    sentences.forEach(function (s) {
      if (acc && (acc + s).length > max) { out.push(acc.trim()); acc = ''; }
      acc += s;
    });
    if (acc.trim()) out.push(acc.trim());
    return out;
  }
  function toast(html) {
    var box = document.getElementById('toasts');
    var d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = html;
    box.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 6500);
  }
  function badgeToast(key) {
    var b = badgeInfo[key] || { title: 'New badge!', description: '' };
    toast(K.badgeSvg(key) + '<div><strong>' + K.esc(b.title) + '</strong>' + K.esc(b.description) + '</div>');
  }
  async function save(step, detail) {
    doneSteps[step] = true;
    if (practice) return;
    var r = await cs.from('progress').upsert({ child_id: childId, lesson_id: lessonId, step_key: step, detail: detail || {} }, { onConflict: 'child_id,lesson_id,step_key' });
    if (r.error) { toast('<div><strong>Couldn’t save that</strong>Check your connection. You can keep playing.</div>'); return; }
    var ev = await cs.rpc('evaluate_badges', { p_child: childId });
    if (!ev.error) (ev.data || []).forEach(function (row) { badgeToast(row.new_badge); });
  }
  function stopSpeech() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }
  function readBtn() {
    return 'speechSynthesis' in window ? '<button type="button" class="btn btn-line btn-small" id="speak">Read to me</button>' : '';
  }
  function wireRead(text) {
    var b = document.getElementById('speak');
    if (!b) return;
    b.addEventListener('click', function () {
      if (window.speechSynthesis.speaking) { stopSpeech(); return; }
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB'; u.rate = 0.9;
      window.speechSynthesis.speak(u);
    });
  }
  window.addEventListener('pagehide', stopSpeech);

  // ---------- teacher view additions (only when `teacher` is true) ----------
  function tnote(parts) {
    if (!teacher) return '';
    var body = parts.filter(Boolean).map(function (p) { return '<p>' + p + '</p>'; }).join('');
    return body ? '<aside class="teacher-note"><strong>For the teacher</strong>' + body + '</aside>' : '';
  }
  function momentNote(m) {
    if (!teacher) return '';
    return tnote([
      // (prompts are written "Ask everyone: ..." / "Ask: ..."; drop that lead-in, the label already says it)
      m.liveUse === 'yes' ? '<b>Ask aloud:</b> ' + K.esc(fill(m.leaderPrompt || '').replace(/^Ask[^:]{0,20}:\s*/, '')) : '<b>This one is for the app and home,</b> not for the live class.',
      'Let children answer in their own words. Never ask a child to speak for their family or culture. Swap in names that are not in your group if you like.'
    ]);
  }
  function runSheetHtml() {
    var sheet = lesson.live && lesson.live.runSheet && lesson.live.runSheet[band];
    if (!teacher || !sheet) return '';
    var acts = {}; ((lesson.live && lesson.live.activities) || []).forEach(function (a) { acts[a.key] = a; });
    var moments = {}; ((lesson.apply && lesson.apply.moments) || []).forEach(function (m) { moments[m.key] = m; });
    var items = sheet.blocks.map(function (b) {
      var d = b.detail || '', m, extra = '';
      if ((m = /^apply\.(.+)$/.exec(d)) && moments[m[1]]) extra = 'Think about it: ' + K.esc(fill(moments[m[1]].scenario));
      else if (d === 'belonging') extra = 'You belong in this story. ' + K.esc((lesson.belonging && lesson.belonging.leaderPrompt) || '');
      else if ((m = /^activities\.(.+)$/.exec(d)) && acts[m[1]]) extra = K.esc(acts[m[1]].prompt);
      else extra = K.esc(d);
      return '<li><b>' + b.minutes + ' min</b> · ' + K.esc(b.block) + '<br><span class="small muted">' + extra + '</span></li>';
    }).join('');
    return '<details class="teacher-note"><summary><strong>Run sheet</strong> · ' + sheet.totalMinutes + ' minutes · ' + (band === 'explorer' ? 'Explorers (5–7)' : 'Trailblazers (8–11)') + '</summary><ol>' + items + '</ol></details>';
  }

  function drawShell() {
    var banner = '';
    if (practice) {
      var draft = teacher && lesson.contentReview && lesson.contentReview.status !== 'approved';
      banner = '<div class="preview-banner">' + (teacher ? 'Teacher view: nothing is saved. ' : 'Practice mode: nothing is saved. ') +
        (childId ? '' : (teacher ? 'Showing: ' : 'Playing as: ') + '<button type="button" class="linkbtn" data-band="explorer" aria-pressed="' + (band === 'explorer') + '">Explorer</button> ' +
          '<button type="button" class="linkbtn" data-band="trailblazer" aria-pressed="' + (band === 'trailblazer') + '">Trailblazer</button>') +
        (draft ? '<br><b>DRAFT:</b> this version has not been approved yet, so children do not see it.' : '') + '</div>';
    }
    app.innerHTML = banner + runSheetHtml() + '<div class="progress" id="progress" aria-hidden="true"></div><div class="stage" id="stage" tabindex="-1"></div>';
    Array.prototype.forEach.call(app.querySelectorAll('[data-band]'), function (b) {
      b.addEventListener('click', function () { band = b.dataset.band; nameMap = null; cur = 0; drawShell(); runStep(); });
    });
  }

  function runStep() {
    stopSpeech();
    var stage = document.getElementById('stage');
    var total = steps.length + 1;
    document.getElementById('progress').innerHTML = Array.apply(null, Array(total)).map(function (_, i) {
      return '<i class="' + (i < cur ? 'on' : i === cur ? 'now' : '') + '"></i>';
    }).join('');
    var step = cur < steps.length ? steps[cur] : 'finish';
    ({ mystery: stepMystery, story: stepStory, quiz: stepQuiz, verse: stepVerse, belong: stepBelong, reflect: stepReflect, finish: stepFinish })[step](stage);
    stage.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }
  function next() { cur++; runStep(); }

  // ---------- 1. mystery ----------
  function stepMystery(stage) {
    var m = lesson.preClass.mystery, shown = 1, state = 'playing', wrong = {};
    var opts = shuffle(m.options.slice());
    draw();
    function draw(msg) {
      var h = '<div class="q-count">Who am I?</div><h2>Mystery character</h2><ul class="clues">' +
        m.clues.slice(0, shown).map(function (c, i) { return '<li><b aria-hidden="true">' + (i + 1) + '</b><span>' + K.esc(c) + '</span></li>'; }).join('') + '</ul>' +
        '<div class="choices">' + opts.map(function (o, i) {
          var cls = 'choice' + (state !== 'playing' && o === m.answer ? ' right' : '') + (wrong[i] ? ' wrong' : '');
          return '<button type="button" class="' + cls + '" data-i="' + i + '"' + (state !== 'playing' || wrong[i] ? ' disabled' : '') + '>' + K.esc(o) + '</button>';
        }).join('') + '</div><p class="msg ' + (state === 'solved' ? 'good' : '') + '" id="msg">' + K.esc(msg || '') + '</p><div class="nav-row">';
      if (state === 'playing') {
        h += shown < m.clues.length
          ? '<button type="button" class="btn btn-sun btn-small" id="more">Give me another clue</button>'
          : '<button type="button" class="btn btn-line btn-small" id="reveal">Show me the answer</button>';
      } else {
        h += '<span></span><button type="button" class="btn btn-sun" id="go">' + (steps.length === 1 ? 'Finish' : 'On to the story') + '</button>';
      }
      stage.innerHTML = h + '</div>';
      Array.prototype.forEach.call(stage.querySelectorAll('.choice'), function (b) {
        b.addEventListener('click', function () {
          var i = parseInt(b.dataset.i, 10);
          if (opts[i] === m.answer) { state = 'solved'; save('mystery', { solved: true, clues: shown }); draw('Yes! It was ' + m.answer + '!'); }
          else { wrong[i] = true; draw('Not quite. Try another clue, or another guess!'); }
        });
      });
      var more = document.getElementById('more'), reveal = document.getElementById('reveal'), go = document.getElementById('go');
      if (more) more.addEventListener('click', function () { shown++; draw(); });
      if (reveal) reveal.addEventListener('click', function () { state = 'revealed'; save('mystery', { solved: false, clues: shown }); draw('It was ' + m.answer + '! Well done for exploring.'); });
      if (go) { go.addEventListener('click', next); go.focus(); }
    }
  }

  // ---------- 2. story ----------
  function storyCards() {
    var st = lesson.live.story, cards = [];
    // (the `note` on the first card of each part is shown only in the teacher view)
    chunk(st.part1.retelling).forEach(function (t, k) {
      cards.push({ title: st.part1.title, text: t, note: k === 0 ? [st.part1.prop && '<b>Prop:</b> ' + K.esc(st.part1.prop), st.part1.callAndResponse && '<b>Call and response:</b> ' + K.esc(st.part1.callAndResponse)] : null });
    });
    if (st.part1.quoted) cards.push({ title: 'The Bible says', quote: st.part1.quoted });
    momentsFor('story.part1').forEach(function (m) { cards.push({ moment: m }); });
    var t2 = band === 'explorer' && st.part2.explorerVersion ? st.part2.explorerVersion : st.part2.retelling;
    chunk(t2).forEach(function (t, k) {
      cards.push({ title: st.part2.title, text: t, note: k === 0 ? [st.part2.prop && '<b>Prop:</b> ' + K.esc(st.part2.prop), (st.part2.soundCues || []).length && '<b>Sound cues:</b> ' + K.esc(st.part2.soundCues.join('; '))] : null });
    });
    if (band === 'trailblazer') (st.part2.quoted || []).forEach(function (q) { cards.push({ title: 'The Bible says', quote: q }); });
    momentsFor('story.part2').forEach(function (m) { cards.push({ moment: m }); });
    return cards;
  }
  function stepStory(stage) {
    var cards = storyCards(), i = 0;
    draw();
    function draw() {
      var c = cards[i], last = i === cards.length - 1;
      var nav = '<div class="nav-row"><div class="row">' + (i > 0 ? '<button type="button" class="btn btn-line btn-small" id="back">Back</button>' : '') + readBtn() + '</div>' +
        '<button type="button" class="btn btn-sun" id="fwd">' + (last ? 'I finished the story!' : (c.moment ? 'Keep going' : 'Next')) + '</button></div>';
      if (c.moment) {
        stage.innerHTML = momentHtml(c.moment) + nav;
        wireRead(momentSpeech(c.moment)); wireMoment(stage, c.moment);
      } else {
        var body = c.quote
          ? '<blockquote class="quote">' + K.esc(c.quote.text) + '<small>' + K.esc(c.quote.ref) + ' (' + K.esc(lesson.translation.id) + ')</small></blockquote>'
          : '<p class="story">' + K.esc(c.text) + '</p>';
        var storyOnly = cards.filter(function (x) { return !x.moment; });
        var storyNum = cards.slice(0, i + 1).filter(function (x) { return !x.moment; }).length;
        stage.innerHTML = '<div class="q-count">Story ' + storyNum + ' of ' + storyOnly.length + '</div><h2>' + K.esc(c.title) + '</h2>' + body + tnote(c.note || []) + nav;
        wireRead(c.quote ? c.quote.text : c.text);
      }
      var b = document.getElementById('back');
      if (b) b.addEventListener('click', function () { stopSpeech(); i--; draw(); });
      document.getElementById('fwd').addEventListener('click', function () {
        stopSpeech();
        if (last) { save('story', { cards: cards.length }); next(); } else { i++; draw(); }
      });
    }
  }

  // ---------- 3. quiz ----------
  function stepQuiz(stage) {
    var qs = (lesson.live.quiz[band] || lesson.live.quiz.trailblazer || []).slice(), i = 0, right = 0;
    if (!qs.length) { save('quiz', {}); return next(); }
    draw();
    function draw() {
      var q = qs[i];
      var opts = shuffle(q.options.map(function (t, idx) { return { t: t, ok: idx === q.answer }; }));
      stage.innerHTML = '<div class="q-count">Question ' + (i + 1) + ' of ' + qs.length + '</div><h2>' + K.esc(q.q) + '</h2>' +
        '<div class="choices">' + opts.map(function (o, k) { return '<button type="button" class="choice" data-k="' + k + '">' + K.esc(o.t) + '</button>'; }).join('') + '</div>' +
        '<p class="msg" id="msg"></p><div class="nav-row"><div class="row">' + readBtn() + '</div><span id="slot"></span></div>';
      wireRead(q.q + '. ' + opts.map(function (o) { return o.t; }).join('. ') + '.');
      var answered = false;
      Array.prototype.forEach.call(stage.querySelectorAll('.choice'), function (b) {
        b.addEventListener('click', function () {
          if (answered) return; answered = true;
          var o = opts[parseInt(b.dataset.k, 10)];
          if (o.ok) right++;
          Array.prototype.forEach.call(stage.querySelectorAll('.choice'), function (x) {
            x.disabled = true;
            if (opts[parseInt(x.dataset.k, 10)].ok) x.classList.add('right'); else if (x === b) x.classList.add('wrong');
          });
          document.getElementById('msg').textContent = o.ok ? 'Yes! Great exploring.' : 'Good try! The answer is “' + q.options[q.answer] + '”.' + (q.ref ? ' (' + q.ref + ')' : '');
          var last = i === qs.length - 1;
          document.getElementById('slot').innerHTML = '<button type="button" class="btn btn-sun" id="nx">' + (last ? 'Done!' : 'Next question') + '</button>';
          var nx = document.getElementById('nx'); nx.focus();
          nx.addEventListener('click', function () {
            stopSpeech();
            if (last) { save('quiz', { correct: right, total: qs.length }); runMoments('quiz', next); } else { i++; draw(); }
          });
        });
      });
    }
  }

  // ---------- 4. memory verse ----------
  function stepVerse(stage) {
    var mv = lesson.live.memoryVerse, tokens = mv.text.split(/\s+/);
    // Split a token into leading punctuation, the word itself, and trailing punctuation.
    var parts = function (w) { var m = /^([^A-Za-z']*)([A-Za-z']*)(.*)$/.exec(w); return { pre: m[1], core: m[2], post: m[3] }; };
    var norm = function (w) { return parts(w).core; };
    var cand = [];
    tokens.forEach(function (w, i) { if (i > 0 && norm(w).length >= 5) cand.push(i); });
    var n = Math.min(band === 'explorer' ? 2 : 3, cand.length), gaps = [];
    for (var j = 0; j < n; j++) gaps.push(cand[Math.floor((j + 0.5) * cand.length / n)]);
    var filled = 0, bank = shuffle(gaps.map(function (g) { return { w: norm(tokens[g]), used: false }; }));
    draw('');
    function draw(msg) {
      var line = tokens.map(function (w, i) {
        var g = gaps.indexOf(i);
        if (g < 0) return K.esc(w);
        var p = parts(w);
        return K.esc(p.pre) + (g < filled ? '<span class="gap">' + K.esc(p.core) + '</span>' : '<span class="gap">&nbsp;</span>') + K.esc(p.post);
      }).join(' ');
      var finished = filled === gaps.length;
      stage.innerHTML = '<div class="q-count">Memory verse</div><h2>' + K.esc(mv.ref) + '</h2><p class="gap-line">' + line + '</p>' +
        (finished ? '<p class="msg good">You did it! Now say it out loud, with actions:</p><ul class="rules-list">' + (mv.actions || []).map(function (a) { return '<li>' + K.esc(a) + '</li>'; }).join('') + '</ul>'
          : '<p>Tap the missing words, in order:</p><div class="bank">' + bank.map(function (b, i) { return '<button type="button" data-i="' + i + '"' + (b.used ? ' disabled' : '') + '>' + K.esc(b.w) + '</button>'; }).join('') + '</div><p class="msg" id="msg">' + K.esc(msg) + '</p>') +
        tnote(['<b>Actions:</b> ' + (mv.actions || []).map(K.esc).join('; '), 'Say it with the actions, then once more from memory. Keep it light: this is not a test.']) +
        '<div class="nav-row"><div class="row">' + readBtn() + '</div>' + (finished ? '<button type="button" class="btn btn-sun" id="nx">Keep going</button>' : '<span></span>') + '</div>';
      wireRead(mv.text);
      Array.prototype.forEach.call(stage.querySelectorAll('.bank button'), function (b) {
        b.addEventListener('click', function () {
          var item = bank[parseInt(b.dataset.i, 10)];
          if (item.w === norm(tokens[gaps[filled]])) { item.used = true; filled++; draw(''); }
          else draw('Not that one. Try another word!');
        });
      });
      var nx = document.getElementById('nx');
      if (nx) { nx.focus(); nx.addEventListener('click', function () { stopSpeech(); save('verse', {}); runMoments('verse', next); }); }
    }
  }

  // ---------- 5. you belong in this story ----------
  // Every lesson carries a "who else is in this story?" spotlight (lesson "belonging").
  // Scripture here is quoted exactly (checked by content/verify-quotes.mjs).
  function stepBelong(stage) {
    var bel = lesson.belonging;
    var cards = ((bel && bel.cards) || []).filter(function (c) { return c.bands.indexOf(band) >= 0; }), i = 0;
    // A lesson without belonging cards (e.g. an older version) is skipped WITHOUT recording the
    // step, so a child still sees the cards once they exist.
    if (!cards.length) return next();
    draw();
    function draw() {
      var c = cards[i], last = i === cards.length - 1;
      var body = '<p class="story">' + K.esc(c.text) + '</p>' +
        (c.quote ? '<blockquote class="quote">' + K.esc(c.quote.text) + '<small>' + K.esc(c.quote.ref) + ' (' + K.esc(lesson.translation.id) + ')</small></blockquote>' : '');
      var sp = bel.spotlight || {};
      stage.innerHTML = '<div class="q-count"><span class="moment-tag belong">You belong in this story</span> ' + (i + 1) + ' of ' + cards.length + '</div><h2>' + K.esc(c.title) + '</h2>' + body +
        (i === 0 ? tnote([bel.leaderPrompt && '<b>Ask aloud:</b> ' + K.esc(bel.leaderPrompt), sp.who && '<b>Who else is in this story:</b> ' + K.esc(sp.who + ' (from ' + sp.from + '). ' + (sp.why || ''))]) : '') +
        '<div class="nav-row"><div class="row">' + (i > 0 ? '<button type="button" class="btn btn-line btn-small" id="back">Back</button>' : '') + readBtn() + '</div>' +
        '<button type="button" class="btn btn-sun" id="fwd">' + (last ? 'On to my mission' : 'Next') + '</button></div>';
      wireRead(c.text + (c.quote ? ' ' + c.quote.text : ''));
      var b = document.getElementById('back');
      if (b) b.addEventListener('click', function () { stopSpeech(); i--; draw(); });
      document.getElementById('fwd').addEventListener('click', function () {
        stopSpeech();
        if (last) { save('belong', { cards: cards.length }); next(); } else { i++; draw(); }
      });
    }
  }

  // ---------- 6. mission, family and reflection ----------
  function stepReflect(stage) {
    var pc = lesson.postClass, chosen = null;
    stage.innerHTML = '<div class="q-count">Your mission</div><h2>' + K.esc(pc.mission.title) + '</h2><p class="story">' + K.esc(pc.mission.description) + '</p>' +
      '<h2 style="margin-top:24px">Talk about it at home</h2><ul class="rules-list">' + pc.familyQuestions.map(function (q) { return '<li>' + K.esc(q) + '</li>'; }).join('') + '</ul>' +
      '<h2 style="margin-top:24px">' + K.esc(pc.reflection.prompt) + '</h2><div class="choices">' +
      pc.reflection.choices.map(function (c, i) { return '<button type="button" class="choice" data-i="' + i + '">' + K.esc(c) + '</button>'; }).join('') + '</div>' +
      (practice ? '' : '<div class="corner"><h3>For the grown-up</h3><p class="small">Tap when it has happened. Only a grown-up should confirm these.</p><div class="row">' +
        '<button type="button" class="btn btn-line btn-small" data-award="helping-hands">We did the mission</button>' +
        '<button type="button" class="btn btn-line btn-small" data-award="table-talkers">We talked about the questions</button></div></div>') +
      '<div class="nav-row"><div class="row">' + readBtn() + '</div><button type="button" class="btn btn-sun" id="nx">Finish</button></div>';
    wireRead(pc.mission.title + '. ' + pc.mission.description);
    Array.prototype.forEach.call(stage.querySelectorAll('.choice'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(stage.querySelectorAll('.choice'), function (x) { x.classList.remove('right'); });
        b.classList.add('right'); chosen = pc.reflection.choices[parseInt(b.dataset.i, 10)];
      });
    });
    Array.prototype.forEach.call(stage.querySelectorAll('[data-award]'), function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        var r = await cs.rpc('award_badge_by_parent', { p_child: childId, p_badge: b.dataset.award });
        if (r.error) { b.disabled = false; toast('<div><strong>Couldn’t save that</strong>Please try again.</div>'); return; }
        b.textContent = '✓ Done'; badgeToast(b.dataset.award);
      });
    });
    document.getElementById('nx').addEventListener('click', function () { stopSpeech(); save('reflect', { choice: chosen }); next(); });
  }

  // ---------- finish ----------
  function stepFinish(stage) {
    var c = lesson.character, mv = lesson.live.memoryVerse || {};
    var isWarmup = steps.length === 1;
    stage.innerHTML = '<h2>' + (isWarmup ? 'Great warm-up!' : 'You did it!') + '</h2>' +
      (isWarmup ? '<p class="story">You’ve met the mystery character. See you in class!</p>'
        : '<p class="story">You’ve added <b>' + K.esc(c.name) + '</b> to your Bible map.</p>' +
          '<div class="cardface" style="margin:18px 0"><div class="who">' + K.esc(c.name) + '</div><div class="tag">' + K.esc(c.cardTagline || '') + '</div>' +
          (mv.ref ? '<div class="verse">' + K.esc(mv.ref) + '</div>' : '') + '</div>') +
      '<div class="nav-row"><span></span>' + (teacher
        ? '<a class="btn btn-sun" href="' + C.base + '/teacher/index.html">Back to teacher home</a>'
        : practice
        ? '<a class="btn btn-sun" href="' + C.base + '/parent/join.html">Grown-ups: create an account to save badges</a>'
        : '<a class="btn btn-sun" href="' + (isWarmup ? home : childHome) + '">' + (isWarmup ? 'Back to my family' : 'Back to my adventures') + '</a>') + '</div>';
  }
})();
