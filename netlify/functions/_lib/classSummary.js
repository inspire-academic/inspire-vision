// After-class summary email for a parent: "Kofi attended the virtual Bible class via Zoom at
// 10:00 ... they studied David ... their teacher was ... here are questions to talk about".
//
// Pure functions only (no network, no database), shared by the scheduled sender
// (notify-class-summaries.js) and the admin preview / test endpoint (cs-class-summary.js),
// so the email an admin previews is byte-for-byte what a parent receives.
//
// Privacy: uses a child's FIRST NAME only (that is all the service ever holds), never a
// surname, age or photo. Wording avoids he/she: "their".
'use strict';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "Inspire (our own church)" -> "Inspire": the email signs off with the short church name.
function churchDisplayName(name) {
  const short = String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  return short || 'Inspire';
}

// "Saturday 3 October" and "10:00", in the CHURCH's time zone (not the server's).
function formatWhen(iso, timeZone) {
  const d = new Date(iso);
  const tz = timeZone || 'Europe/London';
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(d).replace(',', '');
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return { day, time };
}

const endSentence = (s) => { const x = String(s).trim(); return /[.!?]$/.test(x) ? x : x + '.'; };
const fillChild = (text, childName) => String(text == null ? '' : text).replace(/\{child\}/g, childName);

// What they studied: the lesson's own parent-facing synopsis if it has one, otherwise the short
// card tagline (older lessons), otherwise nothing.
function studiedLine(lesson, childName) {
  const c = (lesson && lesson.character) || {};
  if (!c.name) return null;
  const synopsis = lesson.parentEmail && lesson.parentEmail.synopsis;
  if (synopsis) return { name: c.name, detail: fillChild(synopsis, childName), sentences: true };
  if (c.cardTagline) return { name: c.name, detail: String(c.cardTagline) };
  return { name: c.name, detail: '' };
}

// Discussion questions for THIS age group. Prefer the lesson's parentEmail questions; older
// lessons fall back to their family questions (first three).
function questionsFor(lesson, band, childName) {
  const pe = (lesson && lesson.parentEmail && lesson.parentEmail.questions) || {};
  let qs = pe[band] || pe.all;
  if (!Array.isArray(qs) || !qs.length) qs = ((lesson && lesson.postClass && lesson.postClass.familyQuestions) || []).slice(0, 3);
  return qs.map((q) => fillChild(q, childName)).filter(Boolean).slice(0, 4);
}

function buildEmail(input) {
  const child = String(input.childName || '').trim() || 'your child';
  const church = churchDisplayName(input.churchName);
  const when = formatWhen(input.startsAt, input.timezone);
  const studied = studiedLine(input.lesson, child);
  const questions = questionsFor(input.lesson, input.band, child);
  const teacher = input.teacherName ? String(input.teacherName).trim() : '';
  const greeting = input.parentName ? `Hello ${String(input.parentName).trim()},` : 'Hello,';
  const subject = `${child} joined Bible Explorers`;

  // ---- plain text ----
  const t = [];
  t.push(greeting, '');
  t.push(`${child} attended the virtual Bible class via Zoom on ${when.day} at ${when.time}.`, '');
  if (studied) {
    t.push(`They studied ${studied.name}${studied.detail ? (studied.sentences ? `. ${endSentence(studied.detail)}` : `: ${endSentence(studied.detail)}`) : '.'}`, '');
  }
  if (teacher) t.push(`Their teacher for today was ${teacher}.`, '');
  if (questions.length) {
    t.push(`Here are some questions you can discuss with ${child} to reinforce their learning:`);
    questions.forEach((q, i) => t.push(`${i + 1}. ${q}`));
    t.push('');
  }
  t.push(`Thank you for supporting ${child} to become a great Bible explorer.`, '');
  t.push('The Children’s Service team', church, '');
  t.push(`You are receiving this because ${child} is enrolled in Bible Explorers. You can turn these emails off on your family page.`);
  const text = t.join('\n');

  // ---- HTML ----
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body{margin:0;background:#fffaf0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;line-height:1.6;color:#12343b}
  .wrap{max-width:600px;margin:0 auto;padding:20px}
  .head{background:#ffc93c;border-radius:12px 12px 0 0;padding:18px 22px;font-size:20px;font-weight:700}
  .body{background:#fff;border:1px solid #efe3c8;border-top:none;border-radius:0 0 12px 12px;padding:22px}
  .study{background:#fff8e1;border-left:5px solid #ffc93c;border-radius:8px;padding:12px 16px;margin:14px 0}
  ol{padding-left:22px} li{margin:8px 0}
  .fine{color:#5c7076;font-size:13px;margin-top:22px}
</style>
</head>
<body>
<div class="wrap">
  <div class="head">${esc(child)} joined Bible Explorers</div>
  <div class="body">
    <p>${esc(greeting)}</p>
    <p><strong>${esc(child)}</strong> attended the virtual Bible class via Zoom on <strong>${esc(when.day)}</strong> at <strong>${esc(when.time)}</strong>.</p>
    ${studied ? `<div class="study">They studied <strong>${esc(studied.name)}</strong>${studied.detail ? (studied.sentences ? `. ${esc(endSentence(studied.detail))}` : `: ${esc(endSentence(studied.detail))}`) : '.'}</div>` : ''}
    ${teacher ? `<p>Their teacher for today was <strong>${esc(teacher)}</strong>.</p>` : ''}
    ${questions.length ? `<p>Here are some questions you can discuss with ${esc(child)} to reinforce their learning:</p><ol>${questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>` : ''}
    <p>Thank you for supporting ${esc(child)} to become a great Bible explorer.</p>
    <p>The Children’s Service team<br>${esc(church)}</p>
    <p class="fine">You are receiving this because ${esc(child)} is enrolled in Bible Explorers. You can turn these emails off on your family page.</p>
  </div>
</div>
</body>
</html>`;

  return { subject, text, html };
}

// A class is "due" for summaries once it has been over for SETTLE minutes (the join window has
// closed and late check-ins have been made), but not if it ended more than MAX_AGE hours ago
// (so switching the feature on can never email about old classes), and never if cancelled.
function sessionIsDue(session, nowMs, opts) {
  const settleMin = (opts && opts.settleMin) != null ? opts.settleMin : 10;
  const maxAgeH = (opts && opts.maxAgeH) != null ? opts.maxAgeH : 24;
  if (!session || session.status === 'cancelled') return false;
  const end = new Date(session.starts_at).getTime() + Number(session.duration_min) * 60000;
  if (Number.isNaN(end)) return false;
  return end + settleMin * 60000 <= nowMs && end + maxAgeH * 3600000 >= nowMs;
}

// Only a real live attendance counts (not someone who merely watched the recap).
const COUNTS_AS_ATTENDED = ['self_checkin', 'leader'];

module.exports = { esc, churchDisplayName, formatWhen, studiedLine, questionsFor, buildEmail, sessionIsDue, COUNTS_AS_ATTENDED };
