"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";

// Run chips for everyone. The change applies to the next suggestion request on web and iOS.
export function RunChipsControl({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [confirm, dialog] = useConfirm();
  const done = useFreshOnReturn(() => setMessage(""));
  const next = !enabled;

  async function act() {
    const ok = await confirm(next
      ? {
        title: "Turn run chips on?",
        message: "Members picking a venue and date see “On at this venue” suggestions from published run dates, on web and iOS. Nothing is filled in automatically.",
        action: "Turn on",
      }
      : {
        title: "Turn run chips off?",
        message: "Run suggestions stop on the next request. Suggestions from members' own and others' logged shows stay.",
        action: "Turn off",
      });
    if (!ok) return;
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      const { data, error } = await createClient().rpc("admin_set_catalogue_flag", {
        flag_name: "catalogue_run_chips_enabled", value: next,
      });
      if (error || !data) {
        setFailed(true);
        setMessage("Couldn’t change run chips.");
        return;
      }
      setMessage("Updated.");
      done();
      router.refresh();
    } catch {
      setFailed(true);
      setMessage("Couldn’t change run chips.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="secondary" size="sm" disabled={busy} onClick={act}>
        {enabled ? "Turn run chips off" : "Turn run chips on"}
      </Button>
      {message && <p className="text-footnote text-label-secondary" role={failed ? "alert" : "status"}>{message}</p>}
      {dialog}
    </div>
  );
}
