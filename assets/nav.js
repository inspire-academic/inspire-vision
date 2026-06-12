// ============================================================
// INSPIRE VISION™ - Shared Navigation Component
// To update logo across ALL pages: change logo src in assets/
// ============================================================

const INSPIRE_VISION_CONFIG = {
  logoSrc: 'assets/images/Inspire_vision_Logo1.png',  // ← Inspire Vision™ official logo
  logoFallbackIcon: `
    <svg viewBox="0 0 24 24" fill="none" stroke="#c9a84c" stroke-width="1.5" width="22" height="22">
      <polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9"/>
    </svg>
  `,
  logoText: 'INSPIRE VISION',
  logoSuperscript: '™',
  homeUrl: 'index.html',
  academicUrl: 'https://inspireacademic.org',
  navLinks: [
    { label: 'About Us',     href: '#about' },
    { label: 'Our Pillars',  href: '#pillars' },
    { label: 'Impact',       href: '#impact' },
    { label: 'Stories',      href: '#stories' },
    { label: 'Get Involved', href: '#get-involved' },
    { label: 'Resources',    href: '#resources', hasDropdown: true },
  ],
  ctaLabel: 'Begin Your Journey',
  ctaUrl: 'https://inspireacademic.org',
};

function renderNav(activePage = '', breadcrumbs = []) {
  const logoImg = INSPIRE_VISION_CONFIG.logoSrc
    ? `<img src="${INSPIRE_VISION_CONFIG.logoSrc}" alt="Inspire Vision Logo" class="nav-logo-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';

  const breadcrumbHtml = breadcrumbs.length > 0 ? `
    <div class="breadcrumb">
      <a href="${INSPIRE_VISION_CONFIG.homeUrl}">Home</a>
      ${breadcrumbs.map((b, i) => `
        <span class="breadcrumb-sep">›</span>
        ${i === breadcrumbs.length - 1
          ? `<span class="breadcrumb-current">${b.label}</span>`
          : `<a href="${b.href}">${b.label}</a>`
        }
      `).join('')}
    </div>
  ` : '';

  const navLinksHtml = INSPIRE_VISION_CONFIG.navLinks.map(link => `
    <li>
      <a href="${link.href}" class="${activePage === link.label ? 'active' : ''}">
        ${link.label}${link.hasDropdown ? ' <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style="vertical-align:middle"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5"/></svg>' : ''}
      </a>
    </li>
  `).join('');

  document.getElementById('iv-nav').innerHTML = `
    <nav class="iv-nav">
      <a href="${INSPIRE_VISION_CONFIG.homeUrl}" class="nav-logo">
        <div class="nav-logo-icon">
          ${logoImg}
          <div class="nav-logo-fallback" style="${INSPIRE_VISION_CONFIG.logoSrc ? 'display:none' : 'display:flex'}">
            ${INSPIRE_VISION_CONFIG.logoFallbackIcon}
          </div>
        </div>
        <div class="nav-logo-text">
          <span>${INSPIRE_VISION_CONFIG.logoText}</span>
          <span>${INSPIRE_VISION_CONFIG.logoSuperscript}</span>
        </div>
      </a>

      <ul class="nav-links">
        ${navLinksHtml}
        <li><a href="${INSPIRE_VISION_CONFIG.ctaUrl}" class="nav-cta">${INSPIRE_VISION_CONFIG.ctaLabel}</a></li>
      </ul>

      <button class="nav-mobile-btn" onclick="toggleMobileNav()">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </nav>
    ${breadcrumbHtml}
    <div class="nav-mobile-menu" id="nav-mobile-menu">
      <ul>
        ${navLinksHtml}
        <li><a href="${INSPIRE_VISION_CONFIG.ctaUrl}" class="nav-cta">${INSPIRE_VISION_CONFIG.ctaLabel}</a></li>
      </ul>
    </div>
  `;
}

function toggleMobileNav() {
  const menu = document.getElementById('nav-mobile-menu');
  menu.classList.toggle('open');
}
