"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";

// Hide or Dismiss on /app/admin/reports, through resolve_report (admins only).
export function ResolveReport({ reportId, hideLabel }: { reportId: string; hideLabel: string }) {
  const router = useRouter();
  const [confirm, dialog] = useConfirm();
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = saving || refreshing;

  async function resolve(action: "hide" | "dismiss") {
    if (action === "hide" && !(await confirm({ title: `${hideLabel}?`, message: "The person who posted it isn’t told.", action: hideLabel }))) {
      return;
    }
    setSaving(true);
    const { error } = await createClient().rpc("resolve_report", { report_id: reportId, action });
    if (error) {
      setSaving(false);
      window.alert(`Couldn’t resolve the report: ${error.message}`);
      return;
    }
    startRefresh(() => {
      setSaving(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => resolve("hide")}>
        {hideLabel}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => resolve("dismiss")}>
        Dismiss
      </Button>
      {dialog}
    </>
  );
}
