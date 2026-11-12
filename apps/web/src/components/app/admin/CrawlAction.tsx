"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";

// Publish (official-sites route) puts the run dates from findings you marked right into the catalogue by hand.
// That is separate from a source's Publication switch, which publishes London Theatre and Playbill automatically.
export function CrawlAction({ id, action, count }: { id: string; action: "publish" | "redo"; count?: number }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [confirm, dialog] = useConfirm();
  async function act() {
    if (action === "publish" && !(await confirm({
      title: `Publish ${count ?? ""} run dates?`.replace("  ", " "),
      message: "Run dates from the findings you marked right go into the catalogue and can appear as run chips for members.",
      action: "Publish",
    }))) return;
    setBusy(true);setMessage("");
    const {data,error}=action === "publish" ? await createClient().rpc("publish_crawl_findings",{for_run:id,manual:true}) : await createClient().rpc("admin_redo_archive",{for_site:id});
    setBusy(false);setMessage(error ? error.message : action === "publish" ? `${data} runs published.` : "Archive queued for the next crawl.");
    if(!error) router.refresh();
  }
  return <div className="flex flex-col gap-2"><Button variant="secondary" disabled={busy} onClick={act}>{busy?"Working…":action==="publish"?`Publish ${count ?? ""} run dates you marked right`.replace("  "," "):"Read archive again"}</Button><p role="status" className="text-footnote text-label-secondary">{message}</p>{dialog}</div>;
}
