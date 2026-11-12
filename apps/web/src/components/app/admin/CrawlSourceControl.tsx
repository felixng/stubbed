"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";

type Operation = "retry_failed" | "retry_blocked" | "reparse" | "rediscover";

const labels: Record<Operation, string> = {
  retry_failed: "Retry failed pages",
  retry_blocked: "Retry blocked pages",
  reparse: "Read again",
  rediscover: "Start a fresh pass",
};

// Fixes that start over or risk a second block say what will happen first.
const confirmations: Partial<Record<Operation, { title: string; message: string; action: string }>> = {
  retry_blocked: {
    title: "Retry blocked pages?",
    message: "Only do this once you think the block has lifted. Retrying too soon can get us blocked again.",
    action: "Retry",
  },
  rediscover: {
    title: "Start a fresh pass?",
    message: "The current pass becomes an earlier pass and the source is walked again from its directory. Pages already read stay in the catalogue evidence.",
    action: "Start fresh pass",
  },
};

export function CrawlSourceControl({
  source, operation, scan, task, disabled, label,
}: {
  source: string;
  operation: Operation;
  scan?: string;
  task?: string;
  disabled?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  // A finished action's "Updated." shouldn't greet you when you come back to the page.
  const [confirm, dialog] = useConfirm();
  const done = useFreshOnReturn(() => setMessage(""));

  async function act() {
    const question = confirmations[operation];
    if (question && !(await confirm(question))) return;
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      const { data, error } = await createClient().rpc("admin_crawl_source_action", {
        for_source: source, operation, for_generation: scan, for_task: task,
      });
      if (error) {
        setFailed(true);
        setMessage(error.code === "22023" ? error.message : "Couldn’t update crawl work.");
        return;
      }
      setMessage(data ? "Updated." : "No matching work to update.");
      done();
      if (operation === "rediscover") {
        const url = new URL(window.location.href);
        url.searchParams.delete("scan");
        url.searchParams.delete("page");
        router.replace(url.pathname + url.search);
      }
      router.refresh();
    } catch {
      setFailed(true);
      setMessage("Couldn’t update crawl work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="secondary" size="sm" disabled={busy || disabled} onClick={act}>{label ?? labels[operation]}</Button>
      {dialog}
      {message && <p className="text-footnote text-label-secondary" role={failed ? "alert" : "status"}>{message}</p>}
    </div>
  );
}
