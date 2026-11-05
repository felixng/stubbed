"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { CIRCUITS } from "@/lib/admin-theatres";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";

type Props = { id: string; website: string | null; whatsOn: string | null; circuit: string | null };

const FIELD =
  "min-h-11 w-full rounded-md border border-separator bg-surface px-3 text-body text-label focus-visible:outline-2 focus-visible:outline-focus";

function TestLink({ url }: { url: string }) {
  if (!/^https?:\/\//i.test(url.trim())) return null;
  return (
    <a
      href={url.trim()}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 shrink-0 items-center rounded-pill px-3 text-subheadline font-semibold text-tint-text hover:bg-tint-fill"
    >
      Test
    </a>
  );
}

// Edit on /app/backstage/theatres, through admin_update_venue (admins only).
// Theatres on one site share a what's-on link. Saving refreshes the list, so
// the new link shows at once, and closes the editor.
export function EditTheatre({ id, website, whatsOn, circuit }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [site, setSite] = useState(website ?? "");
  const [link, setLink] = useState(whatsOn ?? "");
  const [circ, setCirc] = useState(circuit ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const saved = useFreshOnReturn(() => setOpen(false));

  function close() {
    setSite(website ?? "");
    setLink(whatsOn ?? "");
    setCirc(circuit ?? "");
    setError(null);
    setOpen(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error } = await createClient().rpc("admin_update_venue", {
      venue_id: id,
      new_website: site,
      new_whats_on_url: link,
      new_circuit: circ === "none" ? "" : circ,
    });
    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }
    saved();
    startRefresh(() => {
      setSaving(false);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Edit
      </Button>
    );
  }
  const busy = saving || refreshing;
  return (
    <form onSubmit={save} className="flex w-full flex-col gap-3 rounded-md bg-fill p-3">
      <label className="flex flex-col gap-1 text-footnote text-label-secondary">
        Website
        <span className="flex items-center gap-1">
          <input type="url" value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://" maxLength={500} className={FIELD} />
          <TestLink url={site} />
        </span>
      </label>
      <label className="flex flex-col gap-1 text-footnote text-label-secondary">
        What’s-on link (the page that lists the shows; theatres on one site share it)
        <span className="flex items-center gap-1">
          <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" maxLength={500} className={FIELD} />
          <TestLink url={link} />
        </span>
      </label>
      <label className="flex flex-col gap-1 text-footnote text-label-secondary">
        Circuit
        <select value={circ} onChange={(e) => setCirc(e.target.value)} className={FIELD}>
          <option value="">No circuit</option>
          {CIRCUITS.filter((c) => c.value !== "none").map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-subheadline text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={close}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
