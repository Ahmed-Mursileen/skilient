import type { Email } from "./send";

/** Escapes text for HTML email bodies; user-controlled strings never go in raw. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(title: string, bodyHtml: string, footer: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#F0EFED;color:#0E0D0B;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0EFED;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #DAD8D3;border-radius:12px;">
<tr><td style="padding:32px 32px 8px 32px;">
<p style="margin:0 0 24px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;">Skilient<span style="color:#C03910;">.</span></p>
<h1 style="margin:0 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:32px;">${escapeHtml(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 32px 32px 32px;border-top:1px solid #ECEAE6;"><p style="margin:0;font-size:13px;line-height:20px;color:#5C5A55;">${escapeHtml(footer)}</p></td></tr>
</table></td></tr></table></body></html>`;
}

const p = (text: string) => `<p style="margin:0 0 16px 0;font-size:15px;line-height:24px;">${escapeHtml(text)}</p>`;
const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;"><tr><td style="border-radius:8px;background:#0E0D0B;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a></td></tr></table>`;

export interface NewDeviceDetails {
  device: string;
  location: string | null;
  at: Date;
  notMeUrl: string;
}

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Karachi",
});

/** New-device sign-in alert (PRD 10): device, browser, approximate location, time, "This wasn't me". */
export function newDeviceEmail(to: string, d: NewDeviceDetails): Email {
  const when = `${timeFormat.format(d.at)} (Pakistan time)`;
  const where = d.location ?? "an unknown location";
  const title = "New sign-in to your Skilient account";
  const lines = [
    `Your account was just signed in from a device we haven't seen before.`,
    `Device: ${d.device}`,
    `Where: ${where} (approximate)`,
    `When: ${when}`,
  ];
  return {
    to,
    subject: title,
    html: layout(
      title,
      lines.map(p).join("") +
        p("If this was you, there's nothing to do. If it wasn't, sign out everywhere and choose a new password:") +
        button(d.notMeUrl, "This wasn't me"),
      "This link works once, for 7 days. We send this email for every new device.",
    ),
    text: `${lines.join("\n")}\n\nIf this wasn't you, open this link to sign out everywhere and reset your password:\n${d.notMeUrl}\n`,
  };
}

/** Account locked after 10 failed sign-ins in 15 minutes (PRD 10). */
/** Decisions 2026-09-28: no lockout; the owner hears about repeated wrong passwords. */
export function signInAttemptsEmail(to: string, urls: { codeUrl: string; resetUrl: string }): Email {
  const title = "Someone is trying to sign in to your Skilient account";
  const body =
    "Someone has entered the wrong password for your account 10 times in the last 15 minutes. We've slowed down password sign-in for your account; your account is not locked.";
  const code = "You can still sign in any time with a code we email you, or with your university Google account.";
  return {
    to,
    subject: title,
    html: layout(
      title,
      p(body) + p(code) + button(urls.codeUrl, "Sign in with an emailed code") + p("If this wasn't you, change your password:") +
        button(urls.resetUrl, "Reset my password"),
      "If it was you, there's nothing to do. We send this at most once an hour.",
    ),
    text: `${body}\n\n${code}\nSign in with a code: ${urls.codeUrl}\n\nIf this wasn't you, reset your password: ${urls.resetUrl}\n`,
  };
}

/** A two-factor backup code was used; two-factor is now off until set up again. */
export function backupCodeUsedEmail(to: string, securityUrl: string, at: Date = new Date()): Email {
  const title = "A two-factor backup code was used";
  const body = `Someone signed in to your Skilient account with one of your backup codes on ${timeFormat.format(at)} (Pakistan time). Two-factor authentication is now off and your other backup codes no longer work.`;
  return {
    to,
    subject: title,
    html: layout(
      title,
      p(body) + p("Set up two-factor again from Settings, Security:") + button(securityUrl, "Open security settings"),
      "If this wasn't you, reset your password and set up two-factor again now.",
    ),
    text: `${body}\n\nSet up two-factor again: ${securityUrl}\n\nIf this wasn't you, reset your password now.\n`,
  };
}

/** An organisation admin invites a teammate (PRD 5.20); the link works once and expires in 7 days. */
export function orgInviteEmail(to: string, d: { orgName: string; role: string; link: string }): Email {
  const title = `${d.orgName} invited you to Skilient`;
  const body = `${d.orgName} added you as ${d.role === "admin" ? "an admin" : `a ${d.role}`} on their Skilient recruiter account. Create your account with this work email address to join.`;
  return {
    to,
    subject: title,
    html: layout(title, p(body) + button(d.link, "Create my account") + p("This link works once and expires in 7 days."), "If you weren't expecting this, you can ignore the email."),
    text: `${body}\n\nCreate your account: ${d.link}\n\nThis link works once and expires in 7 days.\n`,
  };
}

export function uniAdminInviteEmail(to: string, d: { university: string; role: string; link: string }): Email {
  const title = `${d.university} invited you to its Skilient portal`;
  const body = `You've been added as ${d.role} on ${d.university}'s university portal on Skilient. Sign in, or create your account with this official email address, then turn on two-factor sign-in to join.`;
  return {
    to,
    subject: title,
    html: layout(title, p(body) + button(d.link, "Open the invite") + p("This link works once and expires in 7 days."), "If you weren't expecting this, you can ignore the email."),
    text: `${body}\n\nOpen the invite: ${d.link}\n\nThis link works once and expires in 7 days.\n`,
  };
}

export function fairInviteEmail(to: string, d: { university: string; fair: string; link: string }): Email {
  const title = `${d.university} invites you to ${d.fair}`;
  const body = `${d.university} invites your company to its job fair "${d.fair}" on Skilient. Fair access is free. Sign in or create a recruiter account with this work email, then accept the invite to open your booth.`;
  return {
    to,
    subject: title,
    html: layout(title, p(body) + button(d.link, "Open the invite"), "If you weren't expecting this, you can ignore the email."),
    text: `${body}\n\nOpen the invite: ${d.link}\n`,
  };
}
