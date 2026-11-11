"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";

export type SwitchKind =
  | { type: "publication"; source: string }
  | { type: "crawling"; source: string }
  | { type: "run_chips" };

type Question = { title: string; message: string; action: string };

// Publication and run chips change what members see, so they ask first, in both directions.
const questions: Record<"publication" | "run_chips", { on: Question; off: Question }> = {
  publication: {
    on: {
      title: "Turn publication on?",
      message: "On the next crawl run, validated shows, venue links and run dates from this source go into the catalogue. New shows appear in members' show search. Diaries are never changed.",
      action: "Turn on",
    },
    off: {
      title: "Turn publication off?",
      message: "Nothing new from this source is published. Shows and runs already published stay; withdraw the source to remove its evidence.",
      action: "Turn off",
    },
  },
  run_chips: {
    on: {
      title: "Turn run chips on?",
      message: "Members picking a venue and date see “On at this venue” suggestions from published run dates, on web and iOS. Nothing is filled in automatically.",
      action: "Turn on",
    },
    off: {
      title: "Turn run chips off?",
      message: "Run suggestions stop on the next request. Suggestions from members' own and others' logged shows stay.",
      action: "Turn off",
    },
  },
};

// One setting that stays on or off until someone changes it. One-off jobs (retry,
// rediscover) are buttons in CrawlSourceControl instead. Without a `kind` the
// switch is shown locked, so a setting that isn't ours to change here still reads as a switch.
export function CrawlSwitch({
  kind, label, description, checked, disabled, note,
}: {
  kind?: SwitchKind;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  note?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [confirm, dialog] = useConfirm();
  const done = useFreshOnReturn(() => setMessage(""));
  const next = !checked;
  const locked = !kind || disabled;

  async function flip() {
    if (!kind) return;
    if (kind.type !== "crawling" && !(await confirm(questions[kind.type][next ? "on" : "off"]))) return;
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      const { data, error } = kind.type === "run_chips"
        ? await createClient().rpc("admin_set_catalogue_flag", { flag_name: "catalogue_run_chips_enabled", value: next })
        : await createClient().rpc("admin_crawl_source_action", {
          for_source: kind.source,
          operation: kind.type === "publication" ? (next ? "publish_on" : "publish_off") : (next ? "resume" : "pause"),
        });
      if (error || !data) {
        setFailed(true);
        setMessage(error?.code === "22023" ? error.message : error ? `Couldn’t change ${label.toLowerCase()}.` : "Already set.");
        return;
      }
      setMessage("Saved.");
      done();
      router.refresh();
    } catch {
      setFailed(true);
      setMessage(`Couldn’t change ${label.toLowerCase()}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span id={`switch-${label}`} className="text-headline">{label}</span>
        <span className="text-footnote text-label-secondary">{description}</span>
        {note && <span className="text-footnote text-label-secondary">{note}</span>}
        {message && <span className="text-footnote text-label-secondary" role={failed ? "alert" : "status"}>{message}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="w-8 text-right text-subheadline font-semibold">{checked ? "On" : "Off"}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={`switch-${label}`}
          disabled={busy || locked}
          onClick={flip}
          className={`relative h-[31px] w-[51px] shrink-0 cursor-pointer rounded-pill transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40 ${checked ? "bg-tint" : "bg-separator"}`}
        >
          <span aria-hidden className={`absolute left-0.5 top-0.5 h-[27px] w-[27px] rounded-full bg-surface shadow-sm transition-transform ${checked ? "translate-x-5" : ""}`} />
        </button>
      </div>
      {dialog}
    </div>
  );
}
