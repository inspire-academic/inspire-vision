// Children's Service — people, roles and logins for ONE church. Church admins only.
//
// What it does (POST JSON { action, ... } with the caller's Supabase token in
// Authorization: Bearer <token>):
//   list          members of this church with their email and last sign-in
//   invite        add a teacher (etc.) by email: assigns the role if the account already
//                 exists, otherwise emails an invitation to set a password
//   assign_role   give an existing member another role
//   set_status    suspend / reactivate one role
//   remove_role   take one non-parent role away
//   set_checks    record / clear the DBS and safeguarding-training dates for a teacher or leader
//   send_reset    email a member a password-reset link
//
// What it deliberately does NOT do: show or set anyone's password; list anyone who is
// not a member of this church (the Supabase project is shared with other sites, whose
// users must never be visible here); let an admin lock themselves out or remove the
// last church admin; touch parents' memberships beyond suspend/reactivate.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (already used by the other admin-* functions).
// Optional: CS_CHURCH_SLUG (default "inspire"), CS_ALLOWED_ORIGINS (comma-separated,
// added to the built-in list used to build invite / reset links).
const { getAdminClient, requireChurchAdmin, DEFAULT_CHURCH_SLUG } = require('./_lib/csAuth');

const STAFF_ROLES = ['facilitator', 'assistant', 'safeguarding_lead', 'church_admin'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BUILT_IN_ORIGINS = ['https://inspirevision.org', 'https://www.inspirevision.org', 'https://staging--inspire-vision.netlify.app'];
const RESET_PATH = '/faith/children-service/parent/reset.html';

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const fail = (status, error) => json(status, { error });

function redirectFor(event, env) {
  const allowed = BUILT_IN_ORIGINS.concat((env.CS_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean));
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  return (allowed.includes(origin) ? origin : BUILT_IN_ORIGINS[0]) + RESET_PATH;   // never an origin we don't own
}

// A calendar date "YYYY-MM-DD" (or null / "" to clear it): must really exist, be from 2000 onwards,
// and not be in the future. (Tomorrow UTC is allowed so a UK evening date is never wrongly refused.)
function parseCheckDate(v, now = new Date()) {
  if (v === null || v === undefined || v === '') return { ok: true, value: null };
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false };
  const d = new Date(v + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return { ok: false };   // e.g. 2026-02-30
  if (d.getUTCFullYear() < 2000) return { ok: false };
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  if (v > tomorrow) return { ok: false };
  return { ok: true, value: v };
}

async function findUserByEmail(admin, email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = (data && data.users) || [];
    const hit = users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

async function handle(event, deps) {
  const admin = deps.admin, env = deps.env || {};
  if (event.httpMethod !== 'POST') return fail(405, 'POST only');

  const auth = await requireChurchAdmin(event, admin, env.CS_CHURCH_SLUG || DEFAULT_CHURCH_SLUG);
  if (!auth.ok) return fail(auth.status, auth.error);
  const { user: me, church } = auth;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return fail(400, 'Invalid JSON'); }
  const cs = admin.schema('children_service');
  const rows = async () => {
    const r = await cs.from('church_members')
      .select('id,user_id,role,status,display_name,dbs_checked_on,safeguarding_trained_on,created_at')
      .eq('church_id', church.id).order('created_at');
    if (r.error) throw r.error;
    return r.data || [];
  };
  const activeAdmins = (all) => all.filter((m) => m.role === 'church_admin' && m.status === 'active');

  try {
    switch (body.action) {
      case 'list': {
        const all = await rows();
        const ids = [...new Set(all.map((m) => m.user_id))];
        const info = {};
        await Promise.all(ids.map(async (id) => {
          const { data } = await admin.auth.admin.getUserById(id);
          const u = data && data.user;
          info[id] = u ? { email: u.email || null, last_sign_in_at: u.last_sign_in_at || null, confirmed: !!(u.email_confirmed_at || u.confirmed_at) } : { email: null, last_sign_in_at: null, confirmed: false };
        }));
        const people = ids.map((id) => {
          const mine = all.filter((m) => m.user_id === id);
          return {
            user_id: id, is_me: id === me.id,
            name: (mine.find((m) => m.display_name) || {}).display_name || null,
            ...info[id],
            roles: mine.map((m) => ({ id: m.id, role: m.role, status: m.status, dbs_checked_on: m.dbs_checked_on, safeguarding_trained_on: m.safeguarding_trained_on }))
          };
        });
        return json(200, { church: { name: church.name }, me: me.id, people });
      }

      case 'invite': {
        const email = String(body.email || '').trim().toLowerCase();
        const role = body.role;
        const first = String(body.first_name || '').trim().slice(0, 40);
        if (!EMAIL.test(email)) return fail(400, 'That email address does not look right.');
        if (!STAFF_ROLES.includes(role)) return fail(400, 'Choose a role.');
        if (/\s/.test(first)) return fail(400, 'Please use just a first name.');
        let target = await findUserByEmail(admin, email);
        let result = 'assigned';
        if (!target) {
          const inv = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: first || null }, redirectTo: redirectFor(event, env) });
          if (inv.error || !(inv.data && inv.data.user)) return fail(502, 'We could not send the invitation. Please try again.');
          target = inv.data.user; result = 'invited';
        }
        const ins = await cs.from('church_members').insert({ church_id: church.id, user_id: target.id, role, status: 'active', display_name: first || null });
        if (ins.error) {
          if (ins.error.code === '23505') return fail(409, 'That person already has that role.');
          throw ins.error;
        }
        return json(200, { ok: true, result, email });
      }

      case 'assign_role': {
        if (!UUID.test(body.user_id || '') || !STAFF_ROLES.includes(body.role)) return fail(400, 'Choose a person and a role.');
        const all = await rows();
        const theirs = all.filter((m) => m.user_id === body.user_id);
        if (!theirs.length) return fail(404, 'That person is not a member of this church.');
        const ins = await cs.from('church_members').insert({
          church_id: church.id, user_id: body.user_id, role: body.role, status: 'active',
          display_name: (theirs.find((m) => m.display_name) || {}).display_name || null
        });
        if (ins.error) {
          if (ins.error.code === '23505') return fail(409, 'They already have that role.');
          throw ins.error;
        }
        return json(200, { ok: true });
      }

      case 'set_status': {
        if (!UUID.test(body.member_id || '') || !['active', 'suspended'].includes(body.status)) return fail(400, 'Invalid request.');
        const all = await rows();
        const row = all.find((m) => m.id === body.member_id);
        if (!row) return fail(404, 'Not found.');
        if (row.role === 'church_admin' && body.status !== 'active') {
          if (row.user_id === me.id) return fail(400, 'You cannot suspend your own church admin access.');
          if (activeAdmins(all).filter((m) => m.id !== row.id).length < 1) return fail(400, 'There must always be one active church admin.');
        }
        const up = await cs.from('church_members').update({ status: body.status }).eq('id', row.id).eq('church_id', church.id);
        if (up.error) throw up.error;
        return json(200, { ok: true });
      }

      case 'remove_role': {
        if (!UUID.test(body.member_id || '')) return fail(400, 'Invalid request.');
        const all = await rows();
        const row = all.find((m) => m.id === body.member_id);
        if (!row) return fail(404, 'Not found.');
        if (row.role === 'parent') return fail(400, 'A family cannot be removed here. Suspend it instead.');
        if (row.role === 'church_admin') {
          if (row.user_id === me.id) return fail(400, 'You cannot remove your own church admin role.');
          if (activeAdmins(all).filter((m) => m.id !== row.id).length < 1) return fail(400, 'There must always be one active church admin.');
        }
        const del = await cs.from('church_members').delete().eq('id', row.id).eq('church_id', church.id);
        if (del.error) throw del.error;
        return json(200, { ok: true });
      }

      case 'set_checks': {
        // Record (or clear) the dates of a teacher's DBS check (or local equivalent) and safeguarding
        // training. A teacher sees class lists and the meeting link only when BOTH are set, so these
        // are validated strictly: real calendar dates, in the past or today, and only for staff roles.
        if (!UUID.test(body.member_id || '')) return fail(400, 'Invalid request.');
        const dbs = parseCheckDate(body.dbs_checked_on), trn = parseCheckDate(body.safeguarding_trained_on);
        if (!dbs.ok || !trn.ok) return fail(400, 'Please enter real dates that are not in the future.');
        const all = await rows();
        const row = all.find((m) => m.id === body.member_id);
        if (!row) return fail(404, 'Not found.');
        if (row.role === 'parent') return fail(400, 'Checks apply to teachers and leaders, not families.');
        const up = await cs.from('church_members')
          .update({ dbs_checked_on: dbs.value, safeguarding_trained_on: trn.value })
          .eq('id', row.id).eq('church_id', church.id);
        if (up.error) throw up.error;
        return json(200, { ok: true });
      }

      case 'send_reset': {
        if (!UUID.test(body.user_id || '')) return fail(400, 'Invalid request.');
        const all = await rows();
        if (!all.some((m) => m.user_id === body.user_id)) return fail(404, 'That person is not a member of this church.');   // cannot be used on anyone else
        const { data } = await admin.auth.admin.getUserById(body.user_id);
        const email = data && data.user && data.user.email;
        if (!email) return fail(404, 'That person has no email address.');
        const r = await admin.auth.resetPasswordForEmail(email, { redirectTo: redirectFor(event, env) });
        if (r.error) return fail(502, 'We could not send the reset email. Please try again.');
        return json(200, { ok: true, email });
      }

      default:
        return fail(400, 'Unknown action.');
    }
  } catch (e) {
    console.error('cs-people error:', e && e.message);            // never echo internals to the browser
    return fail(500, 'Something went wrong. Please try again.');
  }
}

exports.handler = (event) => handle(event, { admin: getAdminClient(), env: process.env });
exports.handle = handle;                                           // exported for tests
