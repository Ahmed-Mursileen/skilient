/**
 * Notification emails (instant and daily digest). Same look as the app's security emails
 * (lib/email/templates.ts), rebuilt here because Edge Functions bundle only this folder.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

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

function footerFor(appUrl: string): string {
  return `You get this because of your notification settings. Change them any time: ${appUrl}/settings/notifications`;
}

/** One notification, sent straight away. */
export function instantEmail(to: string, appUrl: string, item: { subject: string; text: string; href: string }): EmailMessage {
  const url = `${appUrl}${item.href}`;
  const footer = footerFor(appUrl);
  return {
    to,
    subject: item.subject,
    html: layout(item.subject, p(item.text) + button(url, "Open Skilient"), footer),
    text: `${item.text}\n\nOpen Skilient: ${url}\n\n${footer}\n`,
  };
}

/** The daily digest: up to 20 unread items, then a count of the rest. Never sent empty. */
export function digestEmail(
  to: string,
  appUrl: string,
  items: { text: string; href: string }[],
  more: number,
): EmailMessage {
  const total = items.length + more;
  const subject = total === 1 ? "1 thing waiting for you on Skilient" : `${total} things waiting for you on Skilient`;
  const title = "Since you were last here";
  const listHtml = `<ul style="margin:0 0 16px 0;padding-left:20px;font-size:15px;line-height:24px;">${items
    .map((i) => `<li style="margin:0 0 8px 0;"><a href="${escapeHtml(`${appUrl}${i.href}`)}" style="color:#0E0D0B;">${escapeHtml(i.text)}</a></li>`)
    .join("")}</ul>`;
  const moreLine = more > 0 ? `And ${more} more.` : null;
  const footer = footerFor(appUrl);
  return {
    to,
    subject,
    html: layout(title, listHtml + (moreLine ? p(moreLine) : "") + button(`${appUrl}/notifications`, "See all notifications"), footer),
    text: `${title}\n\n${items.map((i) => `- ${i.text} ${appUrl}${i.href}`).join("\n")}\n${moreLine ? `\n${moreLine}\n` : ""}\nSee all: ${appUrl}/notifications\n\n${footer}\n`,
  };
}
