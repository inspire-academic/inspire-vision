// Bible Explorers landing page — the "Who am I?" mystery.
// Reads the clues from the sample lesson JSON so the page proves the
// lesson format really drives the UI. Nothing is stored or sent
// anywhere: no cookies, no localStorage, no network writes.
(function () {
  var LESSON_URL = '/faith/children-service/content/lessons/david-01.json';
  var els = {
    loading: document.getElementById('mystery-loading'),
    clues: document.getElementById('clues'),
    more: document.getElementById('more'),
    opts: document.getElementById('opts'),
    msg: document.getElementById('msg'),
    pop: document.getElementById('badge-pop'),
    fine: document.getElementById('mystery-fine')
  };
  if (!els.clues) return;

  fetch(LESSON_URL)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (lesson) { start(lesson.preClass.mystery); })
    .catch(function () {
      els.loading.textContent = 'The mystery could not load just now. Please try again later.';
    });

  function start(m) {
    var shown = 0;
    els.loading.hidden = true;
    els.clues.hidden = false;
    els.more.hidden = false;
    els.opts.hidden = false;
    els.fine.hidden = false;

    function showClue() {
      var li = document.createElement('li');
      li.className = 'pop';
      var n = document.createElement('b');
      n.textContent = String(shown + 1);
      n.setAttribute('aria-hidden', 'true');
      var t = document.createElement('span');
      t.textContent = m.clues[shown];
      li.appendChild(n);
      li.appendChild(t);
      els.clues.appendChild(li);
      shown++;
      if (shown >= m.clues.length) els.more.hidden = true;
    }

    m.options.forEach(function (name) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.textContent = name;
      b.addEventListener('click', function () { guess(b, name); });
      els.opts.appendChild(b);
    });

    function guess(btn, name) {
      if (name === m.answer) {
        btn.classList.add('right');
        els.msg.className = 'msg good';
        els.msg.textContent = 'Yes! It was ' + m.answer + '!';
        els.pop.classList.add('show');
        els.more.hidden = true;
        Array.prototype.forEach.call(els.opts.children, function (o) { o.disabled = true; });
      } else {
        btn.disabled = true;
        els.msg.className = 'msg';
        els.msg.textContent = 'Not quite. Try another clue, or another guess!';
      }
    }

    els.more.addEventListener('click', showClue);
    showClue();
  }
})();
