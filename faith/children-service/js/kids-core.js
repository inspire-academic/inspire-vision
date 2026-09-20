// Children's Service — shared helpers for every app page.
// Load order: assets/supabase.js, kids-config.js, kids-core.js, then the page script.
(function () {
  var C = window.KIDS_CONFIG;
  var K = (window.KIDS = {});

  K.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  K.qs = function (name) { return new URLSearchParams(location.search).get(name); };

  K.cs = async function () { return (await getDB()).schema(C.schema); };

  K.session = async function () {
    var db = await getDB();
    var res = await db.auth.getSession();
    return res.data.session;
  };

  // Only ever follow a ?next= that stays inside this module (no open redirects).
  K.safeNext = function (next) {
    if (typeof next === 'string' && next.indexOf(C.base + '/') === 0 && next.indexOf('//') === -1) return next;
    return C.base + '/parent/index.html';
  };

  K.requireSession = async function () {
    var s = await K.session();
    if (!s) {
      location.replace(C.base + '/parent/login.html?next=' + encodeURIComponent(location.pathname + location.search));
      return null;
    }
    return s;
  };

  K.signOut = async function () {
    var db = await getDB();
    await db.auth.signOut();
    location.href = C.base + '/index.html';
  };

  // Friendly message for the errors a not-yet-configured project produces,
  // otherwise the raw message (so problems are diagnosable, not hidden).
  K.explain = function (err) {
    if (!err) return '';
    var code = err.code || '';
    var msg = err.message || String(err);
    if (code === 'PGRST106' || code === '42501' || code === '42P01' || /schema/i.test(msg) && /not|invalid|permission/i.test(msg)) {
      return 'The children’s service is not switched on yet. (' + (code || msg) + ')';
    }
    return msg;
  };

  K.fmtWhen = function (iso) {
    try {
      return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  };

  K.bandLabel = function (band) { return band === 'trailblazer' ? 'Trailblazer (8–11)' : 'Explorer (5–7)'; };

  // Header + footer for app pages. Renders into <div id="chrome-top"> / <div id="chrome-bottom">.
  K.mountChrome = function (opts) {
    opts = opts || {};
    var top = document.getElementById('chrome-top');
    var bottom = document.getElementById('chrome-bottom');
    if (top) {
      var nav = opts.signedIn
        ? (opts.teacher ? '<a href="' + C.base + '/teacher/index.html">Teacher home</a>' : '') +
          '<a href="' + C.base + '/parent/index.html' + (opts.teacher ? '?stay=1' : '') + '">My family</a><button type="button" class="linkbtn" id="signout">Sign out</button>'
        : '<a href="' + C.base + '/parent/login.html">Sign in</a><a class="keep" href="' + C.base + '/parent/join.html">Create account</a>';
      top.innerHTML =
        '<header class="top"><div class="wrap">' +
        '<a class="brand" href="' + C.base + '/index.html" aria-label="Bible Explorers home">' +
        '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#ffc93c" stroke="#f0a91b" stroke-width="3"/><circle cx="24" cy="24" r="13" fill="#fff"/><path d="m30 18-4 9-9 4 4-9 9-4Z" fill="#ee6a55"/><circle cx="24" cy="24" r="2" fill="#12343b"/></svg>' +
        '<span><strong>Bible Explorers</strong><small>Inspire Children’s Service</small></span></a>' +
        '<nav aria-label="Account">' + nav + '</nav></div></header>';
      var so = document.getElementById('signout');
      if (so) so.addEventListener('click', K.signOut);
    }
    if (bottom) {
      bottom.innerHTML = '<footer><div class="wrap"><span>A grown-up should always be nearby when children are online.</span>' +
        '<span><a href="' + C.base + '/index.html">About Bible Explorers</a></span></div></footer>';
    }
  };

  // Render an error/notice into #app.
  K.notice = function (html, kind) {
    var app = document.getElementById('app');
    if (app) app.innerHTML = '<div class="card notice ' + (kind || '') + '">' + html + '</div>';
  };
})();
