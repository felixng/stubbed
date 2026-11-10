// Stubbed's auth emails (#484). One shared layout, seven emails.
//   node scripts/emails.mjs build    writes supabase/templates/*.html
//   node scripts/emails.mjs preview  renders them with sample values to
//                                    tmp/emails/*.html, to open in a browser
// The templates are committed; edit this file and run `pnpm emails:build`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Footlight Sweep (docs/DESIGN.md), light only, system fonts, no tracking.
const C = { bg: "#f2f2f7", surface: "#ffffff", label: "#1c1c1e", muted: "#6c6c70", line: "#e0e0e5", tint: "#dc2f4f", fill: "#f2f2f7" };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const confirmUrl = (type) => `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}`;

const emails = [
  {
    file: "confirmation.html",
    section: "Confirm sign up",
    config: "confirmation",
    subject: "Confirm your Stubbed account",
    where: "Confirm signup",
    heading: "Welcome to Stubbed",
    intro: "Confirm your email to start your theatre diary.",
    button: { label: "Confirm my email", url: confirmUrl("signup") },
    code: "Signing up in the app? Enter this code instead:",
    footer: "If you didn’t sign up for Stubbed, ignore this email.",
  },
  {
    file: "recovery.html",
    config: "recovery",
    subject: "Reset your Stubbed password",
    where: "Reset password",
    heading: "Reset your password",
    intro: "Tap the button to choose a new password for your Stubbed account.",
    button: { label: "Choose a new password", url: confirmUrl("recovery") },
    footer: "If you didn’t ask for this, ignore this email. Your password stays as it is.",
  },
  {
    file: "magic_link.html",
    config: "magic_link",
    subject: "Your Stubbed sign-in link",
    where: "Magic link",
    heading: "Sign in to Stubbed",
    intro: "Tap the button to sign in. The link works once.",
    button: { label: "Sign in", url: confirmUrl("magiclink") },
    code: "Signing in on the app? Enter this code instead:",
    footer: "If you didn’t ask to sign in, ignore this email.",
  },
  {
    file: "invite.html",
    config: "invite",
    subject: "You’re invited to Stubbed",
    where: "Invite user",
    heading: "You’re invited to Stubbed",
    intro: "Someone thinks you’d like a diary for the shows you see. Accept to pick your handle and start.",
    button: { label: "Accept the invite", url: confirmUrl("invite") },
    footer: "If you weren’t expecting this, ignore this email.",
  },
  {
    file: "email_change.html",
    config: "email_change",
    subject: "Confirm your new email for Stubbed",
    where: "Change email address",
    heading: "Confirm your new email",
    intro: "You asked to change your Stubbed email to {{ .NewEmail }}. Confirm it to finish.",
    button: { label: "Confirm new email", url: confirmUrl("email_change") },
    footer: "If you didn’t ask for this, ignore this email and your address stays as it is.",
  },
  {
    file: "reauthentication.html",
    config: "reauthentication",
    subject: "Your Stubbed verification code",
    where: "Reauthentication",
    heading: "Your verification code",
    intro: "Enter this code in Stubbed to confirm it’s you.",
    code: "",
    footer: "If you didn’t ask for this, ignore this email.",
  },
  {
    file: "password_changed_notification.html",
    config: "notification.password_changed",
    subject: "Your Stubbed password was changed",
    where: "Security notifications: Password changed",
    heading: "Your password was changed",
    intro: "The password for {{ .Email }} on Stubbed was just changed.",
    footer: "If this was you, nothing more to do. If it wasn’t, reset your password straight away from the sign-in page.",
  },
];

function render(e) {
  const button = e.button
    ? `<tr><td align="left" style="padding: 0 0 24px;">
              <a href="${e.button.url}" style="display: inline-block; background: ${C.tint}; color: #ffffff; font-weight: 600; font-size: 17px; line-height: 20px; text-decoration: none; padding: 14px 28px; border-radius: 999px;">${e.button.label}</a>
            </td></tr>
          <tr><td style="font-size: 13px; line-height: 20px; color: ${C.muted}; padding: 0 0 24px;">Button not working? Copy this link into your browser:<br><a href="${e.button.url}" style="color: ${C.tint}; word-break: break-all;">${e.button.url}</a></td></tr>`
    : "";
  const code = e.code !== undefined
    ? `<tr><td style="font-size: 15px; line-height: 22px; color: ${C.label}; padding: 0 0 8px;">${e.code || "Your code:"}</td></tr>
          <tr><td style="padding: 0 0 24px;"><span style="display: inline-block; background: ${C.fill}; border-radius: 12px; padding: 12px 20px; font-size: 28px; line-height: 32px; font-weight: 700; letter-spacing: 6px; color: ${C.label};">{{ .Token }}</span></td></tr>`
    : "";
  const comment = `<!-- ${e.subject} (#484). Generated by scripts/emails.mjs; edit there, then run pnpm emails:build.
     Local: supabase/config.toml. Hosted: paste into Authentication → Emails → ${e.where}. -->`;
  return `${comment}
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${e.subject}</title>
</head>
<body style="margin: 0; padding: 0; background: ${C.bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: ${C.bg};">
    <tr><td align="center" style="padding: 32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; font-family: ${FONT}; color: ${C.label};">
        <tr><td style="padding: 0 0 16px;">
          <img src="{{ .SiteURL }}/brand/stubbed-mark.png" width="40" alt="" style="display: inline-block; vertical-align: middle; border: 0;">
          <span style="font-size: 20px; font-weight: 700; vertical-align: middle; padding-left: 8px; color: ${C.label};">Stubbed</span>
        </td></tr>
        <tr><td style="background: ${C.surface}; border-radius: 16px; padding: 32px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-size: 24px; line-height: 30px; font-weight: 700; color: ${C.label}; padding: 0 0 12px;">${e.heading}</td></tr>
          <tr><td style="font-size: 17px; line-height: 24px; color: ${C.label}; padding: 0 0 24px;">${e.intro}</td></tr>
          ${button}
          ${code}
          <tr><td style="font-size: 13px; line-height: 20px; color: ${C.muted}; border-top: 1px solid ${C.line}; padding: 16px 0 0;">${e.footer}</td></tr>
          </table>
        </td></tr>
        <tr><td style="font-size: 12px; line-height: 18px; color: ${C.muted}; padding: 16px 0 0; text-align: center;">Stubbed, your theatre diary.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`;
}

const sample = {
  "{{ .SiteURL }}": "http://localhost:3000",
  "{{ .TokenHash }}": "sample-token-hash",
  "{{ .Token }}": "123456",
  "{{ .NewEmail }}": "new@example.com",
  "{{ .Email }}": "you@example.com",
};

const mode = process.argv[2];
if (mode === "build" || mode === "preview") {
  const dir = mode === "build" ? join(root, "supabase/templates") : join(root, "tmp/emails");
  mkdirSync(dir, { recursive: true });
  for (const e of emails) {
    let html = render(e);
    if (mode === "preview") for (const [k, v] of Object.entries(sample)) html = html.replaceAll(k, v);
    writeFileSync(join(dir, e.file), html);
  }
  console.log(`${mode}: wrote ${emails.length} emails to ${dir}`);
  if (mode === "build") {
    const rows = emails.map((e) => `| \`${e.file}\` | ${e.where} | ${e.subject} |`).join("\n");
    writeFileSync(
      join(dir, "README.md"),
      `# Auth email templates

Generated from \`scripts/emails.mjs\` (\`pnpm emails:build\`); preview with \`pnpm emails:preview\` (writes \`tmp/emails/\`). Local Supabase reads them through \`supabase/config.toml\`. On the hosted project, paste each file and its subject under Authentication → Emails.

| File | Hosted dashboard name | Subject |
|---|---|---|
${rows}
`,
    );
  }
} else {
  console.error("usage: node scripts/emails.mjs build|preview");
  process.exit(1);
}
export { emails };
