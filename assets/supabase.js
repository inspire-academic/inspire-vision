// ============================================
// Inspire Ecosystem — Supabase Client
// Shared across all inspirevision.org pages
// ============================================

const SUPABASE_URL = 'https://ygtsrdwoikqnrbexjrtl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XxmrO4J18iyQ1Srub73BhQ_FBhd8mXR';

// Load Supabase from CDN and expose as window.inspireDB
(async () => {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  window.inspireDB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  // Dispatch event so pages know the client is ready
  window.dispatchEvent(new Event('inspireDBReady'));
})();
