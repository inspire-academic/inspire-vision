// Layered-SVG explorer avatars. An avatar is stored as small integers
// (indexes into the lists below), never as free text or an image — so
// there is nothing a child, or anyone else, can put in it beyond "which
// option". No photos, ever (data-minimisation rule for this module).
(function () {
  var K = window.KIDS;

  var OPT = {
    skin: ['#f6d5b8', '#e9b98f', '#c98e63', '#a86a3f', '#7a4a2a', '#4b2e1c'],
    hairColour: ['#1c1410', '#4a2f1b', '#8a5a2b', '#d9a441', '#c0503a', '#7a5fb8'],
    hair: ['Short', 'Curly', 'Long', 'None'],
    gear: ['None', 'Explorer hat', 'Scarf', 'Headband'],
    bg: ['#ffe3a3', '#cdeed4', '#cfe8f3', '#f7cfc7', '#e0d5f3']
  };
  K.AVATAR_OPTIONS = OPT;

  function clamp(v, list) {
    var n = parseInt(v, 10);
    if (isNaN(n) || n < 0 || n >= list.length) return 0;
    return n;
  }

  K.normaliseAvatar = function (a) {
    a = a || {};
    return {
      skin: clamp(a.skin, OPT.skin),
      hair: clamp(a.hair, OPT.hair),
      hairColour: clamp(a.hairColour, OPT.hairColour),
      gear: clamp(a.gear, OPT.gear),
      bg: clamp(a.bg, OPT.bg)
    };
  };

  K.randomAvatar = function () {
    function r(list) { return Math.floor(Math.random() * list.length); }
    return { skin: r(OPT.skin), hair: r(OPT.hair), hairColour: r(OPT.hairColour), gear: r(OPT.gear), bg: r(OPT.bg) };
  };

  var uid = 0;

  // Returns an SVG string. Every value interpolated comes from the
  // OPT lists by a validated index, so it is safe to inject as HTML.
  K.avatarSvg = function (raw, label) {
    var a = K.normaliseAvatar(raw);
    var skin = OPT.skin[a.skin], hair = OPT.hairColour[a.hairColour], bg = OPT.bg[a.bg];
    var id = 'av' + (uid++);
    var s = '<svg viewBox="0 0 100 100" role="img" aria-label="' + K.esc(label || 'Explorer avatar') + '">';
    s += '<defs><clipPath id="' + id + '"><circle cx="50" cy="50" r="48"/></clipPath></defs>';
    s += '<g clip-path="url(#' + id + ')">';
    s += '<rect width="100" height="100" fill="' + bg + '"/>';
    if (a.hair === 2) s += '<path d="M27 46c-2-24 10-32 23-32s25 8 23 32c0 12 2 22 4 30H23c2-8 4-18 4-30Z" fill="' + hair + '"/>';
    s += '<path d="M14 100c2-20 16-28 36-28s34 8 36 28Z" fill="#2f9ac7"/>';
    s += '<rect x="43" y="56" width="14" height="20" rx="6" fill="' + skin + '"/>';
    s += '<ellipse cx="50" cy="44" rx="20" ry="22" fill="' + skin + '"/>';
    if (a.hair === 0) s += '<path d="M30 40c0-14 9-20 20-20s20 6 20 20c-6-3-10-9-14-10-6 6-18 8-26 10Z" fill="' + hair + '"/>';
    if (a.hair === 1) s += '<g fill="' + hair + '"><circle cx="31" cy="35" r="9"/><circle cx="42" cy="25" r="10"/><circle cx="55" cy="24" r="10"/><circle cx="67" cy="33" r="9"/></g>';
    if (a.hair === 2) s += '<path d="M30 40c2-14 12-18 20-18s18 4 20 18c-8-4-14-8-20-8s-12 4-20 8Z" fill="' + hair + '"/>';
    s += '<circle cx="42" cy="46" r="2.7" fill="#12343b"/><circle cx="58" cy="46" r="2.7" fill="#12343b"/>';
    s += '<path d="M42 55q8 8 16 0" fill="none" stroke="#12343b" stroke-width="2.6" stroke-linecap="round"/>';
    if (a.gear === 1) s += '<path d="M27 35c2-16 12-22 23-22s21 6 23 22c-15-6-31-6-46 0Z" fill="#c9821b"/><rect x="21" y="33" width="58" height="6" rx="3" fill="#a9680f"/>';
    if (a.gear === 2) s += '<path d="M33 70c10 8 24 8 34 0l4 11c-13 9-29 9-42 0Z" fill="#ee6a55"/>';
    if (a.gear === 3) s += '<rect x="30" y="31" width="40" height="6" rx="3" fill="#ee6a55"/>';
    s += '</g></svg>';
    return s;
  };
})();
