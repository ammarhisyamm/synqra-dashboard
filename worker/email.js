export async function sendInviteEmail(env, request, { to, inviterName }) {
  // Returns { sent: true } or { sent: false, reason } — never throws.
  // Requires RESEND_API_KEY secret; optional EMAIL_FROM secret (defaults to Resend onboarding sender).
  if (!env.RESEND_API_KEY) return { sent: false, reason: 'email-not-configured' };
  try {
    const origin = new URL(request.url).origin;
    const from = env.EMAIL_FROM || 'Synqra <onboarding@resend.dev>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `${inviterName} invited you to collaborate on Synqra`,
        text: `${inviterName} invited you to collaborate on Synqra as a Viewer.\n\nOpen the workspace: ${origin}\n\nViewers can see reviews, meetings, and boards. Contact ${inviterName} for an account.`,
        html: `<div style="font-family:sans-serif;max-width:480px"><h2>You've been invited to Synqra</h2><p><strong>${inviterName}</strong> invited you to collaborate as a <strong>Viewer</strong>.</p><p><a href="${origin}">Open the workspace</a></p><p style="color:#888;font-size:12px">Viewers can see reviews, meetings, and boards. Contact ${inviterName} for an account.</p></div>`
      })
    });
    if (!response.ok) return { sent: false, reason: `email-provider-${response.status}` };
    return { sent: true };
  } catch {
    return { sent: false, reason: 'email-failed' };
  }
}
