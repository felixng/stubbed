"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";

type Operation = "pause" | "resume" | "retry_failed" | "retry_blocked" | "reparse" | "rediscover" | "publish_on" | "publish_off";

const labels: Record<Operation, string> = {
  pause: "Pause new claims",
  resume: "Resume claims",
  retry_failed: "Retry failed",
  retry_blocked: "Retry blocked",
  reparse: "Reparse page",
  rediscover: "Rediscover directory",
  publish_on: "Turn publication on",
  publish_off: "Turn publication off",
};

// Publication changes what members see in show search, so it asks first.
const confirmations: Partial<Record<Operation, { title: string; message: string; action: string }>> = {
  publish_on: {
    title: "Turn publication on?",
    message: "On the next crawl run, validated shows, venue links and run dates from this source go into the catalogue. New shows appear in members' show search. Diaries are never changed.",
    action: "Turn on",
  },
  publish_off: {
    title: "Turn publication off?",
    message: "Nothing new from this source is published. Shows and runs already published stay; withdraw the source to remove its evidence.",
    action: "Turn off",
  },
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
  const [confirm, dialog] = useConfirm();
  // A finished action's "Updated." shouldn't greet you when you come back to the page.
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
      setMessage(data ? "Updated." : operation.startsWith("publish") ? "Already set." : "No matching work to update.");
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
      <Button variant="secondary" size="sm" disabled={busy || disabled} onClick={act}>{labels[operation]}</Button>
      {message && <p className="text-footnote text-label-secondary" role={failed ? "alert" : "status"}>{message}</p>}
      {dialog}
    </div>
  );
}
