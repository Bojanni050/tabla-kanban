import { Resend } from 'resend';

// Central transactional email service (Resend).
//
// All email sending goes through here so future transactional emails (password
// reset, email verification, ...) only need a new template function, not new
// infrastructure. The API key is read exclusively server-side and never leaves
// the backend.
//
// Environment variables:
//   RESEND_API_KEY  - required; emails fail (with a clear error) when missing
//   EMAIL_FROM      - required; verified sender, e.g. "Kala <noreply@kala.studiovanderheide.nl>"
//   APP_URL         - required; public origin used in links, e.g. https://kala.studiovanderheide.nl

export const EMAIL_FROM =
  process.env.EMAIL_FROM || 'Kala <noreply@kala.studiovanderheide.nl>';
const APP_URL = (process.env.APP_URL || 'https://kala.studiovanderheide.nl').replace(/\/+$/, '');

// Constructed lazily: the backend must boot without RESEND_API_KEY (email sending is
// optional). send() below rejects with a clear error when the key is missing, instead
// of the whole app crashing at import time.
let resendClient: Resend | null = null;
function emailClient(): Resend {
  resendClient ??= new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

export class EmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailSendError';
  }
}

// True when Resend is configured. In production an unconfigured key must fail
// the invitation; in development the invitation can fall back to link sharing.
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function invitationAcceptUrl(token: string): string {
  return `${APP_URL}/invitations/${encodeURIComponent(token)}`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background-color:#CE6F51;border-radius:6px;padding:10px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${label}</a>`;
}

function row(label: string, value: string): string {
  return `<tr>
  <td style="padding:4px 12px 4px 0;color:#8A8578;font-size:14px;white-space:nowrap;">${label}</td>
  <td style="padding:4px 0;color:#2A2F36;font-size:14px;font-weight:600;">${value}</td>
</tr>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapEmail(inner: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Kala</title>
</head>
<body style="margin:0;padding:0;background-color:#FAFAF8;">
<div style="display:none;max-height:0;overflow:hidden;">You are invited to a board in Kala.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAF8;padding:24px 12px;">
<tr>
<td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background-color:#ffffff;border:1px solid #E8E6E1;border-radius:10px;">
<tr>
<td style="padding:28px 28px 8px 28px;text-align:center;">
<a href="${APP_URL}" style="text-decoration:none;color:#2A2F36;font-size:18px;font-weight:700;letter-spacing:3px;">KALA</a>
</td>
</tr>
${inner}
<tr>
<td style="padding:24px 28px 28px 28px;color:#8A8578;font-size:12px;line-height:1.6;text-align:center;">
This is an automated message from Kala.
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

interface SendResult {
  messageId: string;
}

// Low-level send. Throws EmailSendError so callers can decide whether the
// failure is fatal (invitation should not be reported as sent) or ignorable.
// The idempotency key prevents a retry from sending the same email twice.
async function send(options: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
}): Promise<SendResult> {
  if (!process.env.RESEND_API_KEY) {
    throw new EmailSendError('Email is not configured (RESEND_API_KEY is not set)');
  }
  try {
    const { data, error } = await emailClient().emails.send(
      {
        from: EMAIL_FROM,
        to: options.to,
        subject: options.subject,
        html: options.html,
      },
      options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined
    );
    if (error) {
      throw new EmailSendError(error.message);
    }
    return { messageId: data?.id ?? '' };
  } catch (err) {
    if (err instanceof EmailSendError) throw err;
    const message = err instanceof Error ? err.message : 'Unknown Resend error';
    throw new EmailSendError(message);
  }
}

// Board invitation email. `id` is the invitation's database id and doubles as
// the idempotency key, so a retried request never sends the email twice.
export async function sendBoardInvitationEmail(params: {
  invitationId: string;
  to: string;
  boardName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
}): Promise<SendResult> {
  const expiry = params.expiresAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const html = wrapEmail(`<tr>
<td style="padding:8px 28px 20px 28px;">
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#2A2F36;">
You have been invited to a board in Kala.</p>
<p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#2A2F36;">
<strong>${escapeHtml(params.inviterName)}</strong> has invited you to join:</p>
</td>
</tr>
<tr>
<td style="padding:0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F4F1;border:1px solid #E8E6E1;border-radius:8px;">
<tr><td style="padding:14px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0">
${row('Board', escapeHtml(params.boardName))}
${row('Role', ROLE_LABELS[params.role] ?? params.role)}
</table>
</td></tr>
</table>
</td>
</tr>
<tr>
<td align="center" style="padding:24px 28px 8px 28px;">
${button(params.acceptUrl, 'Accept invitation')}
</td>
</tr>
<tr>
<td style="padding:12px 28px 8px 28px;">
<p style="margin:0;font-size:13px;line-height:1.6;color:#8A8578;">
This invitation expires on ${expiry}.</p>
<p style="margin:12px 0 0 0;font-size:13px;line-height:1.6;color:#8A8578;">
If you did not expect this invitation, you can ignore this email.</p>
</td>
</tr>`);
  return send({
    to: params.to,
    subject: 'You have been invited to a board in Kala',
    html,
    idempotencyKey: `board-invitation:${params.invitationId}`,
  });
}
