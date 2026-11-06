"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
export function CrawlAction({ id, action }: { id: string; action: "publish" | "redo" }) {
  const router=useRouter(); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  async function act() {
    setBusy(true);setMessage("");
    const {data,error}=action === "publish" ? await createClient().rpc("publish_crawl_findings",{for_run:id,manual:true}) : await createClient().rpc("admin_redo_archive",{for_site:id});
    setBusy(false);setMessage(error ? error.message : action === "publish" ? `${data} runs published.` : "Archive queued for the next crawl.");
    if(!error) router.refresh();
  }
  return <div className="flex flex-col gap-2"><Button variant="secondary" disabled={busy} onClick={act}>{busy?"Working…":action==="publish"?"Publish checked findings":"Read archive again"}</Button><p role="status" className="text-footnote text-label-secondary">{message}</p></div>;
}
