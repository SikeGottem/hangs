// Resend wrapper for transactional email (magic-link login + crew invites).
// In dev without RESEND_API_KEY we fall back to console.log so the magic link
// is clickable in the terminal — no external dependency required for local dev.

import { Resend } from 'resend'

const apiKey = (process.env.RESEND_API_KEY || '').trim()
const fromAddress = (process.env.EMAIL_FROM || 'onboarding@resend.dev').trim()
const appUrl = (process.env.APP_URL || 'http://localhost:3000').trim()

const resend = apiKey ? new Resend(apiKey) : null

export type MagicLinkContext = {
  email: string
  token: string
  /** Optional — populated when the link is an invite into a specific crew. */
  crewName?: string
  inviterName?: string
}

export function buildMagicLink(token: string, origin?: string): string {
  const base = (origin || appUrl).replace(/\/$/, '')
  return `${base}/api/auth/verify?token=${encodeURIComponent(token)}`
}

// Returns { emailed, link } so callers can fall back to showing the link
// directly when no email provider is configured (early-launch, no Resend yet).
// The link is always returned; `emailed` tells you whether it was actually sent.
export async function sendMagicLink(ctx: MagicLinkContext & { origin?: string }): Promise<{ emailed: boolean; link: string }> {
  const link = buildMagicLink(ctx.token, ctx.origin)
  const isInvite = !!ctx.crewName

  const subject = isInvite
    ? `${ctx.inviterName || 'Someone'} invited you to ${ctx.crewName} on hangs`
    : 'Your hangs login link'

  const greeting = isInvite
    ? `${ctx.inviterName || 'A friend'} wants you to join <strong>${ctx.crewName}</strong> on hangs.`
    : `Click below to finish signing in to hangs.`

  const cta = isInvite ? 'Join the crew' : 'Sign in'

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#F5F1E8;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #E8E3D9;">
      <h1 style="margin:0 0 16px;font-size:24px;color:#1a1a1a;">hangs</h1>
      <p style="font-size:16px;line-height:1.5;color:#1a1a1a;margin:0 0 24px;">${greeting}</p>
      <a href="${link}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">${cta}</a>
      <p style="font-size:13px;color:#666;margin:24px 0 0;">Or paste this link:<br><span style="word-break:break-all;">${link}</span></p>
      <p style="font-size:12px;color:#999;margin:24px 0 0;">This link expires in 15 minutes. If you didn't request it, ignore this email.</p>
    </div>
  </body>
</html>`

  const who = isInvite ? (ctx.inviterName || 'A friend') : 'hangs'
  const where = ctx.crewName || 'hangs'
  const text = isInvite
    ? `${who} invited you to ${where}.\n\nSign in: ${link}\n\nThis link expires in 15 minutes.`
    : `Sign in to hangs: ${link}\n\nThis link expires in 15 minutes.`

  if (!resend) {
    console.log('\n[hangs:email] RESEND_API_KEY not set — returning link to client. Magic link for', ctx.email)
    console.log('[hangs:email] ', link)
    console.log()
    return { emailed: false, link }
  }

  const { error } = await resend.emails.send({
    from: `hangs <${fromAddress}>`,
    to: ctx.email,
    subject,
    html,
    text,
  })

  if (error) {
    console.error('[hangs:email] Resend error:', error)
    throw new Error('Failed to send email')
  }
  return { emailed: true, link }
}
