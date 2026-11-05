// Helpers for the crawl pages under /app/backstage/crawl.

export type Score = { right: number; wrong: number; unsure: number; unreviewed: number; findings: number; missed: number };

// Share right among findings that were marked right or wrong; null before any
// is. "Unsure" and unmarked findings are left out of both sides.
export function shareRight(s: Pick<Score, "right" | "wrong">): number | null {
  const marked = s.right + s.wrong;
  return marked === 0 ? null : s.right / marked;
}

export function scoreLine(s: Score): string {
  const share = shareRight(s);
  const parts = [`${s.findings} ${s.findings === 1 ? "finding" : "findings"}`];
  if (share !== null) parts.push(`${Math.round(share * 100)}% right`);
  parts.push(`${s.wrong} wrong`, `${s.missed} missed`);
  if (s.unsure) parts.push(`${s.unsure} unsure`);
  if (s.unreviewed) parts.push(`${s.unreviewed} not reviewed`);
  return parts.join(" · ");
}

export function sumScores(rows: Score[]): Score {
  return rows.reduce(
    (t, r) => ({
      right: t.right + r.right,
      wrong: t.wrong + r.wrong,
      unsure: t.unsure + r.unsure,
      unreviewed: t.unreviewed + r.unreviewed,
      findings: t.findings + r.findings,
      missed: t.missed + r.missed,
    }),
    { right: 0, wrong: 0, unsure: 0, unreviewed: 0, findings: 0, missed: 0 },
  );
}

export type RunSettings = {
  id: string;
  method: string;
  model: string | null;
  prompt: string | null;
  branch: string | null;
  commit_sha: string | null;
  budget_usd: number | string;
  cost_usd: number | string;
  venue_ids: string[];
};

// The settings of a run on one line, for the header and for comparing.
export function settingsLine(r: RunSettings): string {
  const parts = [r.method === "rules_model" ? "rules, then model" : "rules only"];
  if (r.method === "rules_model") parts.push(r.model || "default model");
  parts.push(r.prompt ? "custom prompt" : "default prompt");
  if (r.branch) parts.push(`branch ${r.branch}${r.commit_sha ? ` @ ${r.commit_sha.slice(0, 7)}` : ""}`);
  parts.push(`cost $${Number(r.cost_usd).toFixed(4)}`);
  return parts.join(" · ");
}

// The command that repeats a run with the same settings, until the admin form
// (#358) can. The prompt is not in the command: save it to a file first.
export function rerunCommand(r: RunSettings): string {
  const args = ["node supabase/scripts/crawl/index.mjs", `--venues ${r.venue_ids.join(",")}`, `--method ${r.method}`];
  if (r.method === "rules_model") {
    if (r.model) args.push(`--model ${r.model}`);
    args.push(`--budget ${Number(r.budget_usd)}`);
    if (r.prompt) args.push("--prompt-file prompt.md");
  }
  return args.join(" ");
}

export const COMPARE_LABEL: Record<string, string> = {
  added: "Added in this run",
  lost: "Lost since the other run",
  changed: "Changed",
  same: "Same",
};
export const COMPARE_ORDER = ["added", "lost", "changed", "same"] as const;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
