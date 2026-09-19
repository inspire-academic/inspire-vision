// Add or edit a child. A child is a first name/nickname, an age group and a
// cartoon avatar — nothing else is collected. Age group is fixed after
// creation (it decides the class); to change it, remove and re-add.
(async function () {
  var C = window.KIDS_CONFIG, K = window.KIDS, O = K.AVATAR_OPTIONS;
  var session = await K.requireSession();
  if (!session) return;
  K.mountChrome({ signedIn: true });

  var app = document.getElementById('app');
  var cs = await K.cs();
  var me = session.user.id;
  var editId = K.qs('id');
  var child = null, church = null;
  var avatar = K.randomAvatar();
  var home = C.base + '/parent/index.html';

  try {
    if (editId) {
      var r = await cs.from('children').select('id,display_name,age_band,avatar,class_id').eq('id', editId).eq('parent_id', me).maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) return K.notice('<h2>We couldn’t find that child</h2><p><a href="' + home + '">Back to my family</a></p>', 'bad');
      child = r.data; avatar = K.normaliseAvatar(child.avatar);
    } else {
      var ch = await cs.rpc('church_by_slug', { p_slug: C.churchSlug });
      if (ch.error) throw ch.error;
      church = (ch.data || [])[0];
      var mem = church && await cs.from('church_members').select('status').eq('user_id', me).eq('role', 'parent').eq('church_id', church.id);
      if (!church || !mem || mem.error || !(mem.data || []).some(function (x) { return x.status === 'active'; })) {
        return K.notice('<h2>Not just yet</h2><p>A leader needs to approve your family before you can add children. <a href="' + home + '">Back to my family</a></p>');
      }
    }
  } catch (e) { return K.notice('<h2>Something went wrong</h2><p>' + K.esc(K.explain(e)) + '</p>', 'bad'); }

  document.title = (child ? 'Edit ' + child.display_name : 'Add a child') + ' — Bible Explorers';
  render();

  function swatches(group, list, label) {
    return '<div class="pick" role="group" aria-label="' + label + '">' + list.map(function (c, i) {
      return '<button type="button" class="sw" data-g="' + group + '" data-i="' + i + '" style="background:' + c + '" aria-label="' + label + ' ' + (i + 1) + '" aria-pressed="' + (avatar[group] === i) + '"></button>';
    }).join('') + '</div>';
  }
  function words(group, list, label) {
    return '<div class="pick" role="group" aria-label="' + label + '">' + list.map(function (t, i) {
      return '<button type="button" data-g="' + group + '" data-i="' + i + '" aria-pressed="' + (avatar[group] === i) + '">' + K.esc(t) + '</button>';
    }).join('') + '</div>';
  }

  function render() {
    var html = '<h1>' + (child ? 'Edit ' + K.esc(child.display_name) : 'Add a child') + '</h1>' +
      '<p class="lede">Just a first name or nickname, and a cartoon explorer to be them.</p>' +
      '<form class="card" id="form" novalidate>' +
      '<div class="field"><label for="dn">First name or nickname</label><input id="dn" type="text" maxlength="30" autocomplete="off" value="' + K.esc(child ? child.display_name : '') + '">' +
      '<p class="hint">No surnames please. This is the only name anyone in class will see.</p></div>';
    if (child) {
      html += '<div class="field"><label>Age group</label><p>' + K.esc(K.bandLabel(child.age_band)) + ' <span class="small muted">(to change this, remove and add again)</span></p></div>';
    } else {
      html += '<fieldset class="field" style="border:0;padding:0;margin:0 0 18px"><legend>Age group</legend><div class="seg">' +
        '<label><input type="radio" name="band" value="explorer"><b>Explorers</b><br><span class="small muted">Ages 5 to 7</span></label>' +
        '<label><input type="radio" name="band" value="trailblazer"><b>Trailblazers</b><br><span class="small muted">Ages 8 to 11</span></label></div></fieldset>';
    }
    html += '<div class="field"><label>Build an explorer</label><div class="builder">' +
      '<div class="preview" id="preview">' + K.avatarSvg(avatar, 'Avatar preview') + '</div><div>' +
      '<p><b>Skin</b></p>' + swatches('skin', O.skin, 'Skin tone') +
      '<p class="spaced"><b>Hair</b></p>' + words('hair', O.hair, 'Hair style') +
      '<p class="spaced"><b>Hair colour</b></p>' + swatches('hairColour', O.hairColour, 'Hair colour') +
      '<p class="spaced"><b>Extras</b></p>' + words('gear', O.gear, 'Extras') +
      '<p class="spaced"><b>Background</b></p>' + swatches('bg', O.bg, 'Background colour') +
      '<div class="spaced"><button type="button" class="btn btn-line btn-small" id="shuffle">Surprise me</button></div>' +
      '</div></div></div>' +
      '<p class="err" id="err" role="alert"></p>' +
      '<div class="row"><button class="btn btn-sun" type="submit" id="save">' + (child ? 'Save' : 'Add to my family') + '</button>' +
      '<a class="btn btn-line" href="' + home + '">Cancel</a></div></form>';

    if (child) {
      html += '<div class="card" id="remove"><h2>Remove ' + K.esc(child.display_name) + '</h2>' +
        '<p>This deletes their name, avatar, attendance, progress and badges from Bible Explorers. It can’t be undone.</p>' +
        '<div id="rm-area"><button class="btn btn-danger btn-small" id="rm" type="button">Remove ' + K.esc(child.display_name) + '</button></div></div>';
    }
    app.innerHTML = html;
    wire();
  }

  function refreshPreview() {
    document.getElementById('preview').innerHTML = K.avatarSvg(avatar, 'Avatar preview');
    Array.prototype.forEach.call(app.querySelectorAll('.pick button'), function (b) {
      b.setAttribute('aria-pressed', String(avatar[b.dataset.g] === parseInt(b.dataset.i, 10)));
    });
  }

  function wire() {
    Array.prototype.forEach.call(app.querySelectorAll('.pick button'), function (b) {
      b.addEventListener('click', function () { avatar[b.dataset.g] = parseInt(b.dataset.i, 10); refreshPreview(); });
    });
    document.getElementById('shuffle').addEventListener('click', function () { avatar = K.randomAvatar(); refreshPreview(); });
    document.getElementById('form').addEventListener('submit', save);
    var rm = document.getElementById('rm');
    if (rm) rm.addEventListener('click', confirmRemove);
  }

  async function save(e) {
    e.preventDefault();
    var err = document.getElementById('err'), btn = document.getElementById('save');
    err.textContent = '';
    var name = document.getElementById('dn').value.trim();
    if (!name) { err.textContent = 'Please add a first name or nickname.'; return; }
    // One word only: two words is almost always first name + surname, which we promise never to keep.
    if (/\s/.test(name)) { err.textContent = 'Please use just one first name or nickname, with no surname. (For a two-part name, join it with a hyphen, like Mary-Ann.)'; return; }
    var band = child ? child.age_band : (app.querySelector('input[name=band]:checked') || {}).value;
    if (!band) { err.textContent = 'Please choose an age group.'; return; }

    btn.disabled = true;
    try {
      var res;
      if (child) {
        res = await cs.from('children').update({ display_name: name, avatar: avatar }).eq('id', child.id);
      } else {
        // Put the child straight into the matching class for their age group, if one exists.
        var cl = await cs.from('classes').select('id').eq('church_id', church.id).eq('age_band', band).eq('active', true).limit(1);
        if (cl.error) throw cl.error;
        res = await cs.from('children').insert({
          church_id: church.id, parent_id: me, display_name: name, age_band: band, avatar: avatar,
          class_id: (cl.data && cl.data[0]) ? cl.data[0].id : null
        });
      }
      if (res.error) throw res.error;
      location.href = home;
    } catch (ex) {
      err.textContent = K.explain(ex); btn.disabled = false;
    }
  }

  function confirmRemove() {
    var area = document.getElementById('rm-area');
    area.innerHTML = '<p><b>Really remove ' + K.esc(child.display_name) + '?</b> Their progress and badges will be deleted.</p>' +
      '<div class="row"><button class="btn btn-danger btn-small" id="rm-yes" type="button">Yes, remove</button>' +
      '<button class="btn btn-line btn-small" id="rm-no" type="button">Keep</button></div><p class="err" id="rm-err" role="alert"></p>';
    document.getElementById('rm-no').addEventListener('click', function () {
      area.innerHTML = '<button class="btn btn-danger btn-small" id="rm" type="button">Remove ' + K.esc(child.display_name) + '</button>';
      document.getElementById('rm').addEventListener('click', confirmRemove);
    });
    document.getElementById('rm-yes').addEventListener('click', async function () {
      this.disabled = true;
      var res = await cs.from('children').delete().eq('id', child.id);
      if (res.error) { document.getElementById('rm-err').textContent = K.explain(res.error); this.disabled = false; return; }
      location.href = home;
    });
  }
})();
