const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
export async function sendInviteEmail(env, request, { to, inviterName, role = 'viewer', inviteUrl }) {
  // Returns { sent: true } or { sent: false, reason } — never throws.
  // Requires RESEND_API_KEY secret; optional EMAIL_FROM secret (defaults to Resend onboarding sender).
  if (!env.RESEND_API_KEY) return { sent: false, reason: 'email-not-configured' };
  try {
    const origin = inviteUrl || new URL(request.url).origin;
    const roleName = role === 'editor' ? 'Editor' : 'Viewer';
    const from = env.EMAIL_FROM || 'Synqra <onboarding@resend.dev>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `${inviterName} invited you to collaborate on Synqra`,
        text: `${inviterName} invited you to collaborate on Synqra as an ${roleName}.\n\nAccept invitation: ${origin}\n\nSign in or create an account using ${to}. This invitation expires in 7 days.`,
        html: `<div style="font-family:sans-serif;max-width:480px"><h2>You've been invited to Synqra</h2><p><strong>${escapeHtml(inviterName)}</strong> invited you to collaborate as an <strong>${roleName}</strong>.</p><p><a href="${escapeHtml(origin)}">Accept invitation</a></p><p>Sign in or create an account using ${escapeHtml(to)}. This invitation expires in 7 days.</p></div>`
      })
    });
    if (!response.ok) return { sent: false, reason: `email-provider-${response.status}` };
    return { sent: true };
  } catch {
    return { sent: false, reason: 'email-failed' };
  }
}
