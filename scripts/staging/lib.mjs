// Shared helper for every Slice 0 staging script. Anon key only — no
// service-role key exists for the staging project anywhere in this repo
// (Founder instruction, 2026-07-12). Every write/read goes through the
// same public REST surface a real browser client would use, exactly
// like the V-01 verification scripts before it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', '..', 'supabase', 'staging', 'staging.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

// Hard safety guard: refuse to run against anything that isn't
// unambiguously the staging project. This is the thing standing
// between "a script has a bug" and "a script touches production."
if (!config.SUPABASE_URL.includes(config.PROJECT_REF)) {
  throw new Error(`Config error: SUPABASE_URL does not contain PROJECT_REF (${config.PROJECT_REF})`);
}
if (config.PROJECT_REF === config.PRODUCTION_PROJECT_REF_DO_NOT_USE) {
  throw new Error('SAFETY ABORT: staging.config.json PROJECT_REF matches the production project ref.');
}
if (config.SUPABASE_URL.includes(config.PRODUCTION_PROJECT_REF_DO_NOT_USE)) {
  throw new Error('SAFETY ABORT: staging.config.json SUPABASE_URL points at the production project.');
}

export const URL = config.SUPABASE_URL;
export const ANON_KEY = config.SUPABASE_ANON_KEY;
export const PROJECT_REF = config.PROJECT_REF;

// Fixed, documented, non-secret credential for synthetic staging-only
// accounts. Not a real secret: these accounts hold zero sensitive
// content, live in an isolated database with no production data, and
// this convention is what lets reset.mjs log back in independently of
// seed.mjs's process lifetime.
export const SYNTHETIC_PASSWORD = 'SliceZero-Synthetic-Test-2026!';
// inspire-staging.test was rejected by Supabase's signup validator
// (error_code: email_address_invalid) — the .test TLD is reserved to
// never resolve, which is apparently exactly why it fails validation.
// example.com is a different reserved domain (RFC 2606) that Supabase
// already accepted throughout the Phase 1/2 production testing.
export const SYNTHETIC_DOMAIN = 'example.com';

export function assertStaging() {
  console.log(`[env check] target project ref: ${PROJECT_REF}`);
  console.log(`[env check] target URL:         ${URL}`);
  console.log(`[env check] production ref is:  ${config.PRODUCTION_PROJECT_REF_DO_NOT_USE} (confirmed NOT the target above)`);
}

export async function signUp(email, password = SYNTHETIC_PASSWORD) {
  const res = await fetch(`${URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  return { status: res.status, id: json.user?.id, token: json.access_token, raw: json };
}

export async function signIn(email, password = SYNTHETIC_PASSWORD) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  return { status: res.status, id: json.user?.id, token: json.access_token, raw: json };
}

export async function mentorshipRequest(method, table, token, { query = '', body, prefer } = {}) {
  const headers = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token || ANON_KEY}`,
  };
  if (method !== 'GET' && method !== 'DELETE') headers['Content-Type'] = 'application/json';
  if (method === 'GET') headers['Accept-Profile'] = 'mentorship';
  else headers['Content-Profile'] = 'mentorship';
  if (prefer) headers['Prefer'] = prefer;

  const res = await fetch(`${URL}/rest/v1/${table}${query}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

export async function listTables() {
  const res = await fetch(`${URL}/rest/v1/?apikey=${ANON_KEY}`, {
    headers: { apikey: ANON_KEY, 'Accept-Profile': 'mentorship' },
  });
  return { status: res.status, ok: res.ok };
}
