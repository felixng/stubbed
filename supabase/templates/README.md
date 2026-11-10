# Auth email templates

Generated from `scripts/emails.mjs` (`pnpm emails:build`); preview with `pnpm emails:preview` (writes `tmp/emails/`). Local Supabase reads them through `supabase/config.toml`. On the hosted project, paste each file and its subject under Authentication → Emails.

| File | Hosted dashboard name | Subject |
|---|---|---|
| `confirmation.html` | Confirm signup | Your Stubbed verification code |
| `recovery.html` | Reset password | Reset your Stubbed password |
| `magic_link.html` | Magic link | Your Stubbed verification code |
| `invite.html` | Invite user | You’re invited to Stubbed |
| `email_change.html` | Change email address | Confirm your new email for Stubbed |
| `reauthentication.html` | Reauthentication | Your Stubbed verification code |
| `password_changed_notification.html` | Security notifications: Password changed | Your Stubbed password was changed |
