import type { BrowserPushSender, BrowserSubscription, NativePushSender, SendResult } from "../notifications/contracts.ts";

/** One claimed owner alert, as `claim_admin_alerts` returns it. */
export type AdminAlert = {
  id: string; lease: string; provider: string; created_at: string;
  push_pending: boolean; email_pending: boolean;
  email: string | null; confirmed: boolean; today: number; total: number;
  destinations: { kind: "apns" | "web"; token: string | null; environment: "sandbox" | "production" | null; subscription: BrowserSubscription | null }[];
};
export type Step = "done" | "skipped" | "retry";
export interface AlertQueue {
  claim(): Promise<AdminAlert[]>;
  finish(alert: AdminAlert, push: Step, email: Step, error?: string): Promise<void>;
}
export type Mailer = { send(to: string, subject: string, html: string, text: string): Promise<"sent" | "retry" | "rejected"> };

const providerName = (p: string) => ({ apple: "Apple", google: "Google", email: "email" } as Record<string, string>)[p] ?? p;
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Lock-screen text carries no personal data: no name, no email address. */
export function pushText(a: AdminAlert) {
  return { title: "New Stubbed sign-up", body: `Signed up with ${providerName(a.provider)} · ${a.today} today`, url: "/app/backstage" };
}

export function emailContent(a: AdminAlert, siteUrl: string) {
  const who = a.email ?? "a new member";
  const rows: [string, string][] = [
    ["Email", who],
    ["Signed up with", providerName(a.provider)],
    ["Confirmed", a.confirmed ? "Yes" : "Not yet"],
    ["Time", new Date(a.created_at).toUTCString()],
    ["Today", String(a.today)],
    ["All time", String(a.total)],
  ];
  const link = `${siteUrl}/app/backstage`;
  const text = `${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nBackstage: ${link}\n`;
  const html = `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;background:#f2f2f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2f7;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1c1e;">
<tr><td style="padding:0 0 16px;"><img src="${siteUrl}/brand/stubbed-logo-email.png" width="160" height="37" alt="Stubbed" style="display:block;border:0;font-size:20px;font-weight:700;color:#1c1c1e;"></td></tr>
<tr><td style="background:#ffffff;border-radius:16px;padding:32px 28px;">
<div style="font-size:24px;line-height:30px;font-weight:700;padding:0 0 16px;">New sign-up${a.confirmed ? "" : " (not confirmed yet)"}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:16px;line-height:24px;">
${rows.map(([k, v]) => `<tr><td style="color:#6c6c70;padding:4px 16px 4px 0;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:4px 0;">${escapeHtml(v)}</td></tr>`).join("\n")}
</table>
<p style="margin:24px 0 0;"><a href="${link}" style="display:inline-block;background:#dc2f4f;color:#ffffff;font-weight:600;font-size:17px;text-decoration:none;padding:14px 28px;border-radius:999px;">Open backstage</a></p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject: `New Stubbed sign-up: ${who}`, html, text };
}

export type AlertConfig = { siteUrl: string; ownerEmail: string | null; native: NativePushSender | null; browser: BrowserPushSender | null; mailer: Mailer | null };

/** Claim, send push and email, report each channel back. A channel that is
 * already done isn't sent again on a retry. */
export async function dispatchAlerts(queue: AlertQueue, config: AlertConfig) {
  const alerts = await queue.claim();
  for (const alert of alerts) {
    let push: Step = "done";
    let email: Step = "done";
    let error: string | undefined;
    if (alert.push_pending) {
      const text = pushText(alert);
      const expires = new Date(Date.now() + 24 * 3600 * 1000);
      const note = { id: alert.id, ...text };
      const results: SendResult[] = [];
      for (const d of alert.destinations) {
        try {
          if (d.kind === "apns" && config.native && d.token && d.environment) results.push(await config.native.send({ token: d.token, environment: d.environment }, note, expires));
          else if (d.kind === "web" && config.browser && d.subscription) results.push(await config.browser.send(d.subscription, note, expires));
          else results.push("permanent");
        } catch { results.push("retryable"); }
      }
      if (results.includes("retryable")) { push = "retry"; error = "push_retryable"; }
      // Say what actually came back, so a push that was refused isn't mistaken for one that arrived.
      const refused = results.filter(r => r !== "accepted" && r !== "retryable");
      if (!error && refused.length) error = `push_${refused.join("+")}`;
      if (!error && results.length === 0) error = "push_no_destinations";
    }
    if (alert.email_pending) {
      if (!config.mailer || !config.ownerEmail) { email = "skipped"; error = error ? `${error},email_skipped` : "email_skipped"; }
      else {
        const c = emailContent(alert, config.siteUrl);
        try {
          const r = await config.mailer.send(config.ownerEmail, c.subject, c.html, c.text);
          if (r === "retry") { email = "retry"; error = "email_retryable"; }
          else if (r === "rejected") error = "email_rejected";
        } catch { email = "retry"; error = "email_retryable"; }
      }
    }
    await queue.finish(alert, push, email, error);
  }
  return { claimed: alerts.length };
}

/** Resend's HTTP API. 429 and 5xx retry; other failures are final. */
export function createResendMailer(apiKey: string, from: string, request: typeof fetch = fetch): Mailer {
  return {
    async send(to, subject, html, text) {
      const response = await request("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(10000),
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, html, text }),
      });
      if (response.ok) return "sent";
      return response.status === 429 || response.status >= 500 ? "retry" : "rejected";
    },
  };
}
