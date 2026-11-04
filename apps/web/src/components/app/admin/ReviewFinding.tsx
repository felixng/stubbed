"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

type Mark = "right" | "wrong" | "unsure";
const MARKS: { value: Mark; label: string }[] = [
  { value: "right", label: "Right" },
  { value: "wrong", label: "Wrong" },
  { value: "unsure", label: "Unsure" },
];

// Mark a finding on /app/admin/crawl/[id] through admin_review_finding. Tapping
// the current mark clears it. The note is saved with the next mark.
export function ReviewFinding({ id, review, note }: { id: string; review: Mark | null; note: string | null }) {
  const router = useRouter();
  const [text, setText] = useState(note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const working = busy || refreshing;

  async function mark(next: Mark | null) {
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc("admin_review_finding", { finding_id: id, new_review: next, new_note: text });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    startRefresh(() => {
      setBusy(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {MARKS.map((m) => (
          <Button
            key={m.value}
            size="sm"
            variant={review === m.value ? "primary" : "secondary"}
            disabled={working}
            aria-pressed={review === m.value}
            onClick={() => mark(review === m.value ? null : m.value)}
          >
            {m.label}
          </Button>
        ))}
      </div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => review && text !== (note ?? "") && mark(review)}
        placeholder="Note (optional)"
        aria-label="Note"
        maxLength={500}
        className="min-h-11 w-full rounded-md border border-separator bg-surface px-3 text-subheadline text-label focus-visible:outline-2 focus-visible:outline-focus"
      />
      {error && (
        <p role="alert" className="text-footnote text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
