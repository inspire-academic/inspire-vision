// Church admins only: PREVIEW the after-class parent email for a class, or SEND A TEST of it to
// the admin's OWN address. It never emails a parent and never changes any data, so an admin can
// see and feel exactly what parents will receive before the real emails are switched on.
//   { action: "preview",   session_id, child_id? }   -> { subject, text, html, sample }
//   { action: "send_test", session_id, child_id? }   -> emails ONLY the signed-in admin
// Without child_id the email is built for a sample child called "Johnny" in the class's age group.
// Needs RESEND_API_KEY for send_test (preview needs nothing).
'use strict';
const { getAdminClient, requireChurchAdmin, DEFAULT_CHURCH_SLUG } = require('./_lib/csAuth');
const { buildEmail } = require('./_lib/classSummary');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FROM = 'Inspire Children’s Service <noreply@inspireacademic.org>';
const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const fail = (status, error) => json(status, { error });

async function handle(event, deps) {
  const admin = deps.admin, env = deps.env || {};
  if (event.httpMethod !== 'POST') return fail(405, 'POST only');
  const auth = await requireChurchAdmin(event, admin, env.CS_CHURCH_SLUG || DEFAULT_CHURCH_SLUG);
  if (!auth.ok) return fail(auth.status, auth.error);
  const { user: me, church } = auth;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return fail(400, 'Invalid JSON'); }
  if (!['preview', 'send_test'].includes(body.action)) return fail(400, 'Unknown action.');
  if (!UUID.test(body.session_id || '')) return fail(400, 'Choose a class.');
  if (body.child_id != null && !UUID.test(body.child_id)) return fail(400, 'Invalid child.');

  try {
    const cs = admin.schema('children_service');
    // Everything is looked up INSIDE this admin's own church, so a session or child id from
    // another church is simply "not found".
    const sr = await cs.from('sessions').select('id,class_id,lesson_id,starts_at,teacher_name').eq('id', body.session_id).eq('church_id', church.id).maybeSingle();
    if (sr.error) throw sr.error;
    if (!sr.data) return fail(404, 'Class not found.');
    const s = sr.data;

    const [ch, lr, cl] = await Promise.all([
      cs.from('churches').select('name,timezone').eq('id', church.id).maybeSingle(),
      s.lesson_id ? cs.from('lessons').select('content').eq('id', s.lesson_id).maybeSingle() : Promise.resolve({ data: null }),
      cs.from('classes').select('age_band').eq('id', s.class_id).maybeSingle()
    ]);
    let childName = 'Johnny', band = (cl.data && cl.data.age_band) || 'explorer', sample = true;
    if (body.child_id) {
      const kr = await cs.from('children').select('display_name,age_band').eq('id', body.child_id).eq('church_id', church.id).maybeSingle();
      if (kr.error) throw kr.error;
      if (!kr.data) return fail(404, 'Child not found.');
      childName = kr.data.display_name; band = kr.data.age_band; sample = false;
    }
    const mail = buildEmail({
      childName, band, parentName: null, startsAt: s.starts_at,
      timezone: ch.data && ch.data.timezone, churchName: (ch.data && ch.data.name) || church.name,
      lesson: lr.data && lr.data.content, teacherName: s.teacher_name
    });

    if (body.action === 'preview') return json(200, { ok: true, sample, subject: mail.subject, text: mail.text, html: mail.html });

    // send_test: to the signed-in admin's own address, and nobody else
    if (!me.email) return fail(400, 'Your account has no email address.');
    if (!deps.resend) return fail(503, 'Email is not set up on the server yet.');
    const banner = 'THIS IS A TEST sent only to you. No parent has been emailed.';
    const r = await deps.resend.emails.send({
      from: FROM, to: me.email, subject: `[TEST] ${mail.subject}`,
      text: `${banner}\n\n${mail.text}`,
      html: mail.html.replace('<div class="wrap">', `<div class="wrap"><p style="background:#fde8e6;border-radius:8px;padding:8px 12px;font-weight:700">${banner}</p>`)
    });
    if (r.error) return fail(502, 'We could not send the test email. Please try again.');
    return json(200, { ok: true, sample, to: me.email });
  } catch (e) {
    console.error('cs-class-summary error:', e && e.message);
    return fail(500, 'Something went wrong. Please try again.');
  }
}

exports.handler = async (event) => {
  let resend = null;
  if (process.env.RESEND_API_KEY) { const { Resend } = require('resend'); resend = new Resend(process.env.RESEND_API_KEY); }
  return handle(event, { admin: getAdminClient(), resend, env: process.env });
};
exports.handle = handle;                                                        // exported for tests
