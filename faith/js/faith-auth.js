// Inspire Faith — shared header auth state + save (bookmark) buttons.
// Every faith/*.html page loads this after assets/supabase.js.
//
// 1) Swaps the Sign In / Join the Journey pills for a member chip +
//    Sign Out once a session resolves, in both the desktop header and
//    the mobile nav. The pills stay in the HTML as the default
//    (logged-out) state so a page never flashes an empty header while
//    the session check is in flight.
// 2) Exposes window.initFaithSaveButtons() — wires up any `.save-btn`
//    bookmark button on the page (data-type/data-title/data-url
//    attributes) against vision.saved_resources. Static pages get this
//    called automatically below; a page that renders its cards from
//    Supabase after load (faith/resources.html) calls it again once
//    its own render finishes — already-wired buttons are skipped via
//    the data-wired flag, so calling it more than once is harmless.
window.initFaithSaveButtons = async function () {
  const db = await getDB();
  const { data: { session } } = await db.auth.getSession();
  const buttons = Array.from(document.querySelectorAll('.save-btn:not([data-wired])'));
  if (!buttons.length) return;

  let savedUrls = new Set();
  if (session) {
    const { data } = await db.schema('vision').from('saved_resources')
      .select('resource_url').eq('user_id', session.user.id);
    savedUrls = new Set((data || []).map(r => r.resource_url));
  }

  buttons.forEach(btn => {
    btn.dataset.wired = '1';
    const url = btn.dataset.url;
    if (session && savedUrls.has(url)) btn.classList.add('saved');

    btn.addEventListener('click', async () => {
      if (!session) {
        window.location.href = '/faith/login.html';
        return;
      }
      btn.disabled = true;
      if (btn.classList.contains('saved')) {
        await db.schema('vision').from('saved_resources').delete()
          .eq('user_id', session.user.id).eq('resource_url', url);
        btn.classList.remove('saved');
      } else {
        await db.schema('vision').from('saved_resources').insert({
          user_id: session.user.id,
          resource_type: btn.dataset.type,
          resource_title: btn.dataset.title,
          resource_url: url,
        });
        btn.classList.add('saved');
      }
      btn.disabled = false;
    });
  });
};

(async () => {
  const db = await getDB();
  const { data: { session } } = await db.auth.getSession();

  if (session) {
    const user = session.user;
    const name = user.user_metadata?.full_name || user.email.split('@')[0];
    const initial = name.trim().charAt(0).toUpperCase();

    const signinBtn = document.querySelector('.header-actions .signin');
    const joinBtn = document.querySelector('.header-actions .join');
    const headerActions = document.querySelector('.header-actions');
    const mobileNav = document.getElementById('mobileNav');

    if (headerActions) {
      signinBtn?.remove();
      joinBtn?.remove();

      const chip = document.createElement('a');
      chip.href = '/faith/dashboard.html';
      chip.className = 'member-chip';
      chip.style.display = 'inline-flex';
      chip.innerHTML = `<span class="avatar">${initial}</span><span>${name}</span>`;

      const signOut = document.createElement('button');
      signOut.type = 'button';
      signOut.className = 'signout-btn';
      signOut.style.display = 'inline-flex';
      signOut.textContent = 'Sign Out';
      signOut.addEventListener('click', async () => {
        await db.auth.signOut();
        window.location.href = '/faith/index.html';
      });

      headerActions.insertBefore(chip, headerActions.firstChild);
      headerActions.insertBefore(signOut, chip.nextSibling);
    }

    if (mobileNav) {
      const row = document.createElement('div');
      row.className = 'member-row';
      row.style.display = 'flex';
      row.innerHTML = `<span class="avatar">${initial}</span><div><strong>${name}</strong><button type="button">Sign Out</button></div>`;
      row.querySelector('button').addEventListener('click', async () => {
        await db.auth.signOut();
        window.location.href = '/faith/index.html';
      });
      mobileNav.insertBefore(row, mobileNav.firstChild);

      const dashLink = document.createElement('a');
      dashLink.href = '/faith/dashboard.html';
      dashLink.textContent = 'My Faith Dashboard';
      mobileNav.insertBefore(dashLink, mobileNav.firstChild);
    }
  }

  window.initFaithSaveButtons();
})();
