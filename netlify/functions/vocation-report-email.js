// Emails a one-off Vocation & Life Pathways report PDF, generated
// client-side in dashboard/vocation/report.html via html2pdf.js and
// handed here as base64. Structurally identical to inspire-academic's
// assessment-report-email.js: this function's only job is validating the
// payload and relaying it through Resend as an attachment. No auth check,
// same reasoning as that function — only payload validation and a size
// ceiling guard what reaches Resend.
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Netlify Functions cap synchronous request bodies at 6MB; base64 inflates
// the raw PDF size by ~33%, so this leaves headroom under that ceiling.
const MAX_BASE64_LENGTH = 7 * 1024 * 1024;

function fail(statusCode, code, message) {
  return { statusCode, body: JSON.stringify({ success: false, error: { code, message } }) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return fail(405, 'method_not_allowed', 'Method Not Allowed');
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return fail(400, 'invalid_json', 'Request body must be valid JSON.');
  }

  const { recipientEmail, studentName, pdfBase64, filename } = body;

  if (!recipientEmail || !studentName || !pdfBase64) {
    return fail(400, 'missing_fields', 'recipientEmail, studentName and pdfBase64 are required.');
  }
  if (!EMAIL_RE.test(recipientEmail)) {
    return fail(400, 'invalid_email', 'Please provide a valid email address.');
  }
  if (pdfBase64.length > MAX_BASE64_LENGTH) {
    return fail(400, 'payload_too_large', 'The generated report is too large to email — try downloading it instead.');
  }
  if (!process.env.RESEND_API_KEY) {
    return fail(200, 'not_configured', 'Email sending is not configured right now.');
  }

  try {
    const safeName = String(studentName).replace(/</g, '&lt;');
    const { data, error } = await resend.emails.send({
      from: 'Inspire Mentorship <noreply@inspireacademic.org>',
      to: recipientEmail,
      subject: `${studentName}'s Vocation & Life Pathways Report`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0A1628; color: white; padding: 24px 20px; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 24px 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px; }
    .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><div style="font-size:20px; font-weight:700">Inspire Mentorship</div></div>
    <div class="content">
      <p>Hello,</p>
      <p><strong>${safeName}</strong> has shared their Vocation &amp; Life Pathways report with you. It's attached as a PDF.</p>
      <div class="footer"><p>Inspire Mentorship &amp; Formation</p></div>
    </div>
  </div>
</body>
</html>
      `,
      attachments: [{
        filename: filename || `${String(studentName).replace(/[^a-z0-9]+/gi, '_')}_Vocation_Report.pdf`,
        content: pdfBase64,
      }],
    });

    if (error) throw error;
    return { statusCode: 200, body: JSON.stringify({ success: true, messageId: data.id }) };
  } catch (error) {
    console.error('vocation-report-email failed:', error);
    return fail(502, 'email_failed', 'Could not send the report email. Please try again shortly.');
  }
};
