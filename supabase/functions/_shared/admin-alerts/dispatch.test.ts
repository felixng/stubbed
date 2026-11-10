import { createResendMailer, dispatchAlerts, emailContent, pushText, type AdminAlert, type AlertConfig, type Step } from "./dispatch.ts";

const alert = (over: Partial<AdminAlert> = {}): AdminAlert => ({
  id: "a1", lease: "l1", provider: "google", created_at: "2026-11-10T10:00:00Z", push_pending: true, email_pending: true,
  email: "new.person@example.com", confirmed: false, today: 3, total: 120,
  destinations: [{ kind: "apns", token: "ab".repeat(32), environment: "production", subscription: null }], ...over,
});
function harness(alerts: AdminAlert[], over: Partial<AlertConfig> = {}) {
  const sent = { push: [] as { body: string; title: string }[], email: [] as string[], finished: [] as [Step, Step, string | undefined][] };
  const queue = { claim: () => Promise.resolve(alerts), finish: (_: AdminAlert, p: Step, e: Step, err?: string) => { sent.finished.push([p, e, err]); return Promise.resolve(); } };
  const config: AlertConfig = {
    siteUrl: "https://getstubbed.app", ownerEmail: "owner@example.com",
    native: { send: (_d, n) => { sent.push.push(n); return Promise.resolve("accepted"); } }, browser: null,
    mailer: { send: (to) => { sent.email.push(to); return Promise.resolve("sent"); } }, ...over,
  };
  return { sent, run: () => dispatchAlerts(queue, config) };
}
const eq = (a: unknown, b: unknown, msg: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

Deno.test("sends the push and the email once per alert", async () => {
  const h = harness([alert()]);
  await h.run();
  eq(h.sent.push.length, 1, "one push");
  eq(h.sent.email, ["owner@example.com"], "one email");
  eq(h.sent.finished, [["done", "done", undefined]], "finished");
});

Deno.test("push text carries no email address or name", () => {
  const t = pushText(alert());
  eq(t.body, "Signed up with Google · 3 today", "body");
  if (JSON.stringify(t).includes("example.com") || JSON.stringify(t).includes("new.person")) throw new Error("personal data in push");
});

Deno.test("email names the person, confirmation and totals", () => {
  const c = emailContent(alert(), "https://getstubbed.app");
  eq(c.subject, "New Stubbed sign-up: new.person@example.com", "subject");
  for (const part of ["Not yet", "Google", "120", "/app/backstage"]) if (!c.html.includes(part) || !c.text.includes(part)) throw new Error(`missing ${part}`);
});

Deno.test("email skipped when Resend or the owner address is unset; push still goes", async () => {
  const h = harness([alert()], { mailer: null });
  await h.run();
  eq(h.sent.push.length, 1, "push");
  eq(h.sent.finished, [["done", "skipped", "email_skipped"]], "finished");
  const h2 = harness([alert()], { ownerEmail: null });
  await h2.run();
  eq(h2.sent.email.length, 0, "no email");
  eq(h2.sent.finished[0][1], "skipped", "skipped");
});

Deno.test("a channel already done is not sent again", async () => {
  const h = harness([alert({ push_pending: false, destinations: [] })]);
  await h.run();
  eq(h.sent.push.length, 0, "no push");
  eq(h.sent.email.length, 1, "email");
});

Deno.test("a failing Resend response retries, a rejected one does not", async () => {
  for (const [status, expected] of [[503, "retry"], [429, "retry"], [422, "done"]] as const) {
    const mailer = createResendMailer("key", "Stubbed <alerts@getstubbed.app>", () => Promise.resolve(new Response("{}", { status })));
    const h = harness([alert()], { mailer });
    await h.run();
    eq(h.sent.finished[0][1], expected, `status ${status}`);
  }
});

Deno.test("Resend request: from alerts@getstubbed.app, bearer key", async () => {
  let seen: { headers: Headers; body: { from: string; to: string[] } } | undefined;
  const mailer = createResendMailer("secret", "Stubbed <alerts@getstubbed.app>", (_u, init) => {
    seen = { headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
    return Promise.resolve(new Response("{}", { status: 200 }));
  });
  await mailer.send("owner@example.com", "s", "<p>h</p>", "t");
  eq(seen?.headers.get("authorization"), "Bearer secret", "auth");
  eq(seen?.body.from, "Stubbed <alerts@getstubbed.app>", "from");
  eq(seen?.body.to, ["owner@example.com"], "to");
});

Deno.test("a retryable push is retried, a thrown send is retryable", async () => {
  const h = harness([alert()], { native: { send: () => Promise.reject(new Error("boom")) } });
  await h.run();
  eq(h.sent.finished[0][0], "retry", "push retry");
  eq(h.sent.finished[0][1], "done", "email still done");
});

Deno.test("a refused or missing push is recorded, not silently done", async () => {
  const refused = harness([alert()], { native: { send: () => Promise.resolve("invalid_destination") } });
  await refused.run();
  eq(refused.sent.finished[0], ["done", "done", "push_invalid_destination"], "refused");
  const none = harness([alert({ destinations: [] })]);
  await none.run();
  eq(none.sent.finished[0][2], "push_no_destinations", "no destinations");
});
