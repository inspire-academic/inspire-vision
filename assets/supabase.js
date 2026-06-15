// ============================================
// Inspire Ecosystem — Supabase Client
// Shared across all inspirevision.org pages
// ============================================

const SUPABASE_URL = 'https://ygtsrdwoikqnrbexjrtl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XxmrO4J18iyQ1Srub73BhQ_FBhd8mXR';

(async () => {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  window.inspireDB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();

// Helper — waits for inspireDB to be ready before resolving
window.getDB = () => new Promise(resolve => {
  if (window.inspireDB) return resolve(window.inspireDB);
  const interval = setInterval(() => {
    if (window.inspireDB) { clearInterval(interval); resolve(window.inspireDB); }
  }, 50);
});
