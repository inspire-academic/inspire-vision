// Weekly scheduled digest: emails each mentor whose active pairing(s)
// have gone quiet or worse, using the exact same silence-detection
// computation admin-matching.js and mentor-portal/mentees.html already
// use (green <=14 days since last session/message/check-in, amber
// 15-30, red >30 or never). Built 2026-09 because that signal was
// previously pull-only — a mentor had to remember to open My Mentees
// to see it. This makes it push instead, without duplicating the
// health logic a third time in a different shape.
//
// Scheduled via netlify.toml (`schedule = "0 8 * * 1"`, weekly Monday
// 08:00 UTC). Netlify does not allow scheduled functions to be invoked
// over public HTTP — only the platform's own scheduler can trigger
// this — so unlike the other netlify/functions/*.js in this repo, there
// is no requireAdmin()/session check here; there is no caller to
// authenticate.
//
// A mentor with every mentee green gets no email that week — silence
// here means "nothing needs you," not "we forgot you."
const { Resend } = require('resend');
const { getAdminClient } = require('./_lib/adminAuth');

async function listAllUsers(admin) {
  const users = [];
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

const HEALTH_LABEL = { amber: 'Quiet', red: 'Needs attention' };

// Pure — no I/O — so it can be unit-tested directly (see
// tests/notify-mentor-staleness.spec.js) without a live Supabase/Resend
// connection. exports.handler below is just this plus the network calls
// that gather sessions/messages/checkins and send the emails.
function groupStaleAssignmentsByMentor(assignments, sessions, messages, checkins, now = Date.now()) {
  const latestByStudent = new Map();
  const bump = (studentId, ts) => {
    if (!ts) return;
    const t = new Date(ts).getTime();
    const cur = latestByStudent.get(studentId);
    if (!cur || t > cur) latestByStudent.set(studentId, t);
  };
  (sessions || []).forEach(s => bump(s.student_id, s.scheduled_at));
  (messages || []).forEach(m => bump(m.student_id, m.created_at));
  (checkins || []).forEach(c => bump(c.student_id, c.created_at));

  const healthFor = (studentId) => {
    const latest = latestByStudent.get(studentId);
    if (!latest) return 'red';
    const days = (now - latest) / 86400000;
    return days <= 14 ? 'green' : days <= 30 ? 'amber' : 'red';
  };

  const byMentor = new Map();
  for (const a of assignments) {
    const health = healthFor(a.student_id);
    if (health === 'green') continue;
    if (!byMentor.has(a.mentor_id)) byMentor.set(a.mentor_id, []);
    byMentor.get(a.mentor_id).push({ name: a.student_name, health });
  }
  return byMentor;
}

exports.handler = async () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.RESEND_API_KEY) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY or RESEND_API_KEY not set — skipping mentor staleness digest.');
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'not configured' }) };
  }

  try {
    const admin = getAdminClient();

    const [{ data: assignments, error: assignErr }, users] = await Promise.all([
      admin.schema('mentorship').from('mentor_assignments').select('*').eq('status', 'active'),
      listAllUsers(admin),
    ]);
    if (assignErr) throw assignErr;
    if (!assignments || !assignments.length) {
      return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'no active assignments' }) };
    }

    const studentIds = assignments.map(a => a.student_id);
    const [{ data: sessions }, { data: messages }, { data: checkins }] = await Promise.all([
      admin.schema('mentorship').from('sessions').select('student_id, scheduled_at').in('student_id', studentIds),
      admin.schema('mentorship').from('messages').select('student_id, created_at').in('student_id', studentIds),
      admin.schema('mentorship').from('check_ins').select('student_id, created_at').in('student_id', studentIds),
    ]);
    const usersById = new Map(users.map(u => [u.id, u]));
    const byMentor = groupStaleAssignmentsByMentor(assignments, sessions, messages, checkins);

    if (!byMentor.size) {
      return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'every pairing is currently green' }) };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    let sent = 0;
    const failures = [];

    for (const [mentorId, mentees] of byMentor) {
      const mentor = usersById.get(mentorId);
      if (!mentor?.email) continue;
      const mentorName = (mentor.user_metadata?.full_name || '').split(/\s+/)[0] || 'there';
      // Red first — a mentor scanning the email should see the more
      // overdue names before the merely-quiet ones.
      const sorted = [...mentees].sort((a, b) => (a.health === 'red' ? 0 : 1) - (b.health === 'red' ? 0 : 1));
      const rows = sorted.map(m => `<li><b>${(m.name || '').replace(/</g, '&lt;')}</b> — ${HEALTH_LABEL[m.health]}</li>`).join('');

      try {
        const { error } = await resend.emails.send({
          from: 'Inspire Mentorship <noreply@inspireacademic.org>',
          to: mentor.email,
          subject: `${mentees.length} of your mentee${mentees.length === 1 ? '' : 's'} could use a check-in`,
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0A1628; color: white; padding: 24px 20px; border-radius: 8px 8px 0 0; }
    .header .tag { display:inline-block; background:#B85C1A; color:#fff; font-size:12px; font-weight:700; padding:4px 10px; border-radius:999px; margin-bottom:8px; }
    .content { background: #fff; padding: 24px 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px; }
    ul { padding-left: 20px; }
    .meta { color: #666; font-size: 13px; }
    .cta { display:inline-block; margin-top:8px; background:#B85C1A; color:#fff !important; text-decoration:none; padding:10px 18px; border-radius:8px; font-weight:700; font-size:14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="tag">Weekly mentee check</div>
      <div style="font-size:20px; font-weight:700">Hi ${mentorName}, here's who might need you this week</div>
    </div>
    <div class="content">
      <p>No session, message, or check-in has been logged recently for:</p>
      <ul>${rows}</ul>
      <p class="meta">This is just a nudge — a quick message or scheduling a session resets the clock. If everything's fine, no action needed.</p>
      <a class="cta" href="https://www.inspirevision.org/mentorship/mentor-portal/mentees.html">View My Mentees</a>
    </div>
  </div>
</body>
</html>
          `,
        });
        if (error) throw error;
        sent += 1;
      } catch (error) {
        console.error(`notify-mentor-staleness: failed to email mentor ${mentorId}:`, error);
        failures.push(mentorId);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ sent, mentorsFlagged: byMentor.size, failures }) };
  } catch (error) {
    console.error('notify-mentor-staleness failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

exports.groupStaleAssignmentsByMentor = groupStaleAssignmentsByMentor;
