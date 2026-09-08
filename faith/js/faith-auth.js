// Inspire Faith — shared header auth state.
// Every faith/*.html page loads this after assets/supabase.js. It swaps
// the Sign In / Join the Journey pills for a member chip + Sign Out once
// a session resolves, in both the desktop header and the mobile nav.
// The pills stay in the HTML as the default (logged-out) state so a page
// never flashes an empty header while the session check is in flight.
(async () => {
  const db = await getDB();
  const { data: { session } } = await db.auth.getSession();
  if (!session) return;

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
})();
