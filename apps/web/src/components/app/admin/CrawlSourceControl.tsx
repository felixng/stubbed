"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

type Operation = "pause" | "resume" | "retry_failed" | "retry_blocked" | "reparse" | "rediscover";

const labels: Record<Operation, string> = {
  pause: "Pause new claims",
  resume: "Resume claims",
  retry_failed: "Retry failed",
  retry_blocked: "Retry blocked",
  reparse: "Reparse page",
  rediscover: "Rediscover directory",
};

export function CrawlSourceControl({
  source, operation, scan, task, disabled,
}: {
  source: string;
  operation: Operation;
  scan?: string;
  task?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function act() {
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
      <Button variant="secondary" size="sm" disabled={busy || disabled} onClick={act}>{labels[operation]}</Button>
      {message && <p className="text-footnote text-label-secondary" role={failed ? "alert" : "status"}>{message}</p>}
    </div>
  );
}
