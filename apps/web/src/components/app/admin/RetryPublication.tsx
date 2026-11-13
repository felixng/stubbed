"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

// Puts a source's parked publication items back in the queue (admin_retry_crawl_publication).
export function RetryPublication({ source }: { source: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function retry() {
    setBusy(true);
    setMessage("");
    const { error } = await createClient().rpc("admin_retry_crawl_publication", { for_source: source });
    setBusy(false);
    if (error) { setMessage("Couldn’t try again."); return; }
    router.refresh();
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="secondary" disabled={busy} onClick={retry}>{busy ? "Working…" : "Try again"}</Button>
      <p role="status" className="text-footnote text-label-secondary">{message}</p>
    </div>
  );
}
