// Scheduled (every 10 minutes, see netlify.toml): emails a parent a short summary after their
// child has attended a live class. Content and wording come from _lib/classSummary.js, the same
// module the admin preview uses.
//
// SAFETY, in the order it matters:
//  * OFF BY DEFAULT. Nothing is sent unless the Netlify env var CS_CLASS_SUMMARIES is exactly
//    "on". Deploying this file changes nothing until someone deliberately switches it on.
//  * Only real live attendance counts (a family check-in or a teacher marking the child
//    present), never someone who only watched the recap.
//  * A class is emailed about once it has been over for 10 minutes, and NEVER if it ended more
//    than 24 hours ago, so switching the feature on cannot email about old classes. Cancelled
//    classes never send.
//  * ONE email per child per class, ever. Each attendance row is CLAIMED (summary_sent_at set,
//    only where it was still empty) BEFORE sending, so two overlapping runs cannot both send.
//    If the send fails the claim is released and the next run retries, until the 24 hours pass.
//  * A class with no lesson attached sends NOTHING (there would be no "what they studied" and no
//    questions). Nobody is marked as emailed, so attaching a lesson within 24 hours still sends.
//  * A parent who has switched the emails off (consents row, type "communications", given=false)
//    is skipped, and the row is marked so it is not looked at again.
//  * At most 40 emails per run, so a mistake can never turn into a flood.
//  * Logs only counts, never names or email addresses.
//
// Netlify only runs scheduled functions on the PUBLISHED (production) deploy, and does not allow
// them to be called over HTTP, so there is no caller to authenticate.
'use strict';
const { getAdminClient } = require('./_lib/adminAuth');
const { buildEmail, sessionIsDue, lessonReady, COUNTS_AS_ATTENDED } = require('./_lib/classSummary');

const FROM = 'Inspire Children’s Service <noreply@inspireacademic.org>';   // the one domain Resend is verified for
const MAX_PER_RUN = 40;

async function run(deps) {
  const { admin, env } = deps;
  const now = deps.now || new Date();
  if (env.CS_CLASS_SUMMARIES !== 'on') return { skipped: 'switched off' };
  const resend = deps.resend;
  if (!resend) return { skipped: 'email is not configured' };

  const cs = admin.schema('children_service');
  const since = new Date(now.getTime() - 27 * 3600000).toISOString();
  const sr = await cs.from('sessions')
    .select('id,church_id,class_id,lesson_id,starts_at,duration_min,status,teacher_name')
    .gte('starts_at', since).lte('starts_at', now.toISOString());
  if (sr.error) throw sr.error;
  const due = (sr.data || []).filter((s) => sessionIsDue(s, now.getTime()));

  const out = { classes: due.length, sent: 0, optedOut: 0, noEmail: 0, noLesson: 0, skippedChild: 0, failed: 0, capped: false };

  for (const s of due) {
    if (out.sent >= MAX_PER_RUN) { out.capped = true; break; }
    const att = await cs.from('attendance').select('id,child_id').eq('session_id', s.id).is('summary_sent_at', null).in('source', COUNTS_AS_ATTENDED);
    if (att.error) throw att.error;
    if (!(att.data || []).length) continue;

    const [church, lessonRow, cls, kids] = await Promise.all([
      cs.from('churches').select('name,timezone').eq('id', s.church_id).maybeSingle(),
      s.lesson_id ? cs.from('lessons').select('content').eq('id', s.lesson_id).maybeSingle() : Promise.resolve({ data: null }),
      cs.from('classes').select('age_band').eq('id', s.class_id).maybeSingle(),
      cs.from('children').select('id,display_name,age_band,parent_id,archived_at').in('id', att.data.map((a) => a.child_id))
    ]);
    const lesson = lessonRow.data && lessonRow.data.content;
    // No lesson attached (or an empty one): nothing to say about what was studied, so send nothing.
    // Nobody is marked as emailed, so if a leader attaches a lesson within the 24 hours, the next run sends.
    if (!lessonReady(lesson)) { out.noLesson += att.data.length; continue; }
    const kidById = {}; (kids.data || []).forEach((k) => { kidById[k.id] = k; });

    for (const a of att.data) {
      if (out.sent >= MAX_PER_RUN) { out.capped = true; break; }
      // CLAIM first: only one run can ever move this row from "not sent" to "sent".
      const claim = await cs.from('attendance').update({ summary_sent_at: now.toISOString() }).eq('id', a.id).is('summary_sent_at', null).select('id');
      if (claim.error || !(claim.data || []).length) continue;
      try {
        const child = kidById[a.child_id];
        if (!child || child.archived_at) { out.skippedChild++; continue; }

        // Has this parent switched the emails off? The latest 'communications' consent wins.
        const pref = await cs.from('consents').select('given,created_at')
          .eq('parent_id', child.parent_id).eq('type', 'communications').is('child_id', null)
          .order('created_at', { ascending: false }).limit(1);
        if (pref.data && pref.data[0] && pref.data[0].given === false) { out.optedOut++; continue; }

        const { data: pu } = await admin.auth.admin.getUserById(child.parent_id);
        const to = pu && pu.user && pu.user.email;
        if (!to) { out.noEmail++; continue; }
        const pm = await cs.from('church_members').select('display_name')
          .eq('user_id', child.parent_id).eq('church_id', s.church_id).eq('role', 'parent').maybeSingle();

        const mail = buildEmail({
          childName: child.display_name, band: child.age_band || (cls.data && cls.data.age_band),
          parentName: pm.data && pm.data.display_name, startsAt: s.starts_at,
          timezone: church.data && church.data.timezone, churchName: church.data && church.data.name,
          lesson, teacherName: s.teacher_name
        });
        const sent = await resend.emails.send({ from: FROM, to, subject: mail.subject, html: mail.html, text: mail.text, ...(env.CS_REPLY_TO ? { reply_to: env.CS_REPLY_TO } : {}) });
        if (sent.error) throw new Error('email provider refused the message');
        out.sent++;
      } catch (e) {
        out.failed++;
        // release the claim so the next run retries (until the 24 hours are up)
        await cs.from('attendance').update({ summary_sent_at: null }).eq('id', a.id);
      }
    }
  }
  return out;
}

exports.handler = async () => {
  try {
    let resend = null;
    if (process.env.CS_CLASS_SUMMARIES === 'on' && process.env.RESEND_API_KEY) {
      const { Resend } = require('resend');
      resend = new Resend(process.env.RESEND_API_KEY);
    }
    const result = await run({ admin: getAdminClient(), resend, env: process.env });
    console.log('notify-class-summaries:', JSON.stringify(result));            // counts only: no names, no addresses
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (e) {
    console.error('notify-class-summaries failed:', e && e.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'failed' }) };
  }
};
exports.run = run;                                                              // exported for tests
