"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { BAR, SAMPLE_SIZE } from "@/lib/admin-candidates";
import { createClient } from "@/lib/supabase/client";

type Props = {
  q: string;
  type: string;
  sample: string;
  pendingInGroup: number;
  canAdd: boolean;
  scoreMessage: string | null;
};

// Check a random sample of a group, see its score, then add the rest of the
// group once it is good enough (admin_add_candidates_bulk enforces the bar and
// at most 2,000 a call).
export function CandidateBulk({ q, type, sample, pendingInGroup, canAdd, scoreMessage }: Props) {
  const router = useRouter();
  const [confirm, dialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const working = busy || refreshing;
  const sb = () => createClient();

  async function startSample() {
    setBusy(true);
    setError(null);
    setNote(null);
    const { data, error } = await sb().rpc("admin_start_candidate_sample", { q: q || null, in_type: type || null, sample_size: SAMPLE_SIZE });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    params.set("sample", String(data));
    setBusy(false);
    router.push(`/app/backstage/shows/candidates?${params.toString()}`);
  }

  async function addRest() {
    const ok = await confirm({
      title: `Add the rest of this group?`,
      message: `Up to 2,000 of the ${pendingInGroup.toLocaleString("en-GB")} pending names are added as shows now. Names that already read as an existing show are linked to it instead. Run it again for the remainder.`,
      action: "Add them",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const { data, error } = await sb().rpc("admin_add_candidates_bulk", {
      q: q || null, in_type: type || null, sample, min_share: BAR, max_rows: 2000,
    });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const r = data as unknown as { added: number; linked: number; remaining: number };
    startRefresh(() => {
      setBusy(false);
      setNote(`Added ${r.added}, linked ${r.linked} to existing shows; ${r.remaining.toLocaleString("en-GB")} still pending.`);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-separator bg-surface p-4 shadow-sm">
      <h2 className="text-headline text-label">Add many at once</h2>
      <p className="text-footnote text-label-secondary">
        Review a random sample of the group below (search and type apply), mark each Add, Same as or Not a show, and when {Math.round(BAR * 100)}% of the sample is
        right, add the rest. {pendingInGroup.toLocaleString("en-GB")} pending in this group.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={working || pendingInGroup === 0} onClick={startSample}>
          {sample ? "Take a new sample" : `Review a sample of ${SAMPLE_SIZE}`}
        </Button>
        {sample && (
          <Button size="sm" disabled={working || !canAdd} onClick={addRest}>
            Add the rest
          </Button>
        )}
      </div>
      {scoreMessage && <p className="text-subheadline text-label">{scoreMessage}</p>}
      {note && <p className="text-subheadline text-label">{note}</p>}
      {error && (
        <p role="alert" className="text-footnote text-destructive">
          {error}
        </p>
      )}
      {dialog}
    </section>
  );
}
