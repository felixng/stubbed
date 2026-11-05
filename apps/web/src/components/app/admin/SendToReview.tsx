"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

type Result = { considered: number; already_shows: number; new_candidates: number; seen_again: number };

// On /app/backstage/crawl/[id]: send the findings marked right to show review
// (admin_send_findings_to_review). Talks, concerts, wrong and unmarked
// findings stay out, and so do titles that already read as a show.
export function SendToReview({ runId, waiting }: { runId: string; waiting: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [refreshing, startRefresh] = useTransition();

  async function send() {
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc("admin_send_findings_to_review", { for_run: runId });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    startRefresh(() => {
      setBusy(false);
      setResult(data as unknown as Result);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-separator bg-surface p-4 shadow-sm">
      <h2 className="text-headline text-label">New show names</h2>
      <p className="text-footnote text-label-secondary">
        {waiting > 0
          ? `${waiting} ${waiting === 1 ? "finding" : "findings"} marked right and not yet sent. Titles that aren’t already shows go to show review as candidates, with this page as their source. Nothing reaches search until you add it there.`
          : "Findings marked right that aren’t shows yet can be sent to show review from here."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={busy || refreshing || waiting === 0} onClick={send}>
          Send to show review
        </Button>
        <Link href="/app/backstage/shows/candidates" className="inline-flex min-h-11 items-center text-subheadline font-semibold text-tint-text">
          Open show candidates
        </Link>
      </div>
      {result && (
        <p className="text-subheadline text-label">
          Looked at {result.considered}: {result.new_candidates} new {result.new_candidates === 1 ? "name" : "names"}, {result.seen_again} already waiting (count raised),{" "}
          {result.already_shows} already shows.
        </p>
      )}
      {error && (
        <p role="alert" className="text-footnote text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
