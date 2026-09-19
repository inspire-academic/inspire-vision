// Badge art, keyed by badges.key in the database. Art lives in code (not
// the database) so a badge can never be given an arbitrary image.
(function () {
  var K = window.KIDS;
  var GLYPH = {
    flame: '<path d="M36 14c3 8 12 13 12 24a12 12 0 0 1-24 0c0-6 3-9 5-12 1 4 3 6 5 6-1-8 0-13 2-18Z" fill="#fff"/>',
    lens: '<circle cx="32" cy="32" r="11" fill="none" stroke="#fff" stroke-width="5"/><path d="m40 40 12 12" stroke="#fff" stroke-width="6" stroke-linecap="round"/>',
    pin: '<path d="M36 14a13 13 0 0 0-13 13c0 10 13 26 13 26s13-16 13-26A13 13 0 0 0 36 14Zm0 18a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" fill="#fff"/>',
    book: '<path d="M14 22c8-3 16-2 22 3 6-5 14-6 22-3v28c-8-3-16-2-22 3-6-5-14-6-22-3Z" fill="#fff"/><path d="M36 25v28" stroke="rgba(0,0,0,.25)" stroke-width="3"/>',
    star: '<polygon points="36,14 42,29 58,30 46,40 50,56 36,47 22,56 26,40 14,30 30,29" fill="#fff"/>',
    question: '<text x="36" y="50" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="600" font-size="40" fill="#fff">?</text>',
    heart: '<path d="M36 55S16 43 16 29a10 10 0 0 1 20-4 10 10 0 0 1 20 4c0 14-20 26-20 26Z" fill="#fff"/>',
    check: '<path d="M20 37l11 11 21-23" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>',
    team: '<circle cx="24" cy="40" r="7" fill="#fff"/><circle cx="48" cy="40" r="7" fill="#fff"/><circle cx="36" cy="26" r="8" fill="#fff"/><path d="M14 58c1-8 6-11 10-11s9 3 10 11ZM38 58c1-8 6-11 10-11s9 3 10 11Z" fill="#fff"/>'
  };
  var ART = {
    'camp-fire-friend': ['#ffc93c', '#f0a91b', 'flame'],
    'catch-up-champion': ['#4fae63', '#358548', 'check'],
    'story-detective': ['#2f9ac7', '#1e7ba3', 'lens'],
    'map-marker': ['#4fae63', '#358548', 'pin'],
    'verse-keeper': ['#7a5fb8', '#5b4390', 'book'],
    'brave-like-david': ['#ee6a55', '#c34b38', 'star'],
    'helping-hands': ['#ee6a55', '#c34b38', 'heart'],
    'table-talkers': ['#ffc93c', '#f0a91b', 'heart'],
    'big-question-asker': ['#0b4a51', '#062f34', 'question'],
    'team-trailblazers': ['#2f9ac7', '#1e7ba3', 'team']
  };

  // locked = true draws a grey "?" placeholder (badges still to discover).
  K.badgeSvg = function (key, locked) {
    if (locked) {
      return '<svg viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="33" fill="#ece5d3" stroke="#d8cdb0" stroke-width="4"/>' +
        '<text x="36" y="49" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="600" font-size="34" fill="#b8ab88">?</text></svg>';
    }
    var a = ART[key] || ['#ffc93c', '#f0a91b', 'star'];
    return '<svg viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="33" fill="' + a[0] + '" stroke="' + a[1] + '" stroke-width="4"/>' + GLYPH[a[2]] + '</svg>';
  };
})();
