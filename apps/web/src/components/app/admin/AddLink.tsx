"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";

const FIELD = "min-h-11 w-full min-w-0 rounded-md border border-separator bg-surface px-3 text-body text-label";

// Paste any link: a directory of venues, a directory of shows, or one show page. Stubbed works out which.
export function AddLink() {
  const router = useRouter();
  const [round, setRound] = useState(0);
  const done = useFreshOnReturn(() => setRound(value => value + 1));
  return <AddLinkForm key={round} onDone={() => { done(); router.refresh(); }} />;
}

function AddLinkForm({ onDone }: { onDone: () => void }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage(""); setFailed(false);
    const { error } = await createClient().rpc("admin_add_crawl_link", { link });
    setBusy(false);
    if (error) { setFailed(true); setMessage(["22023", "23505"].includes(error.code ?? "") ? error.message : "Couldn’t add that link. Try again."); return; }
    setLink(""); setMessage("Added. It is in the list below."); onDone();
  }
  return (
    <form onSubmit={add} className="flex flex-col gap-2" aria-label="Add a link">
      <label htmlFor="crawl-link" className="text-subheadline font-semibold">Add a link</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="crawl-link" type="url" inputMode="url" required value={link} onChange={e => setLink(e.target.value)}
          placeholder="https://… a venue directory, a show directory or a show page" className={FIELD} />
        <Button type="submit" disabled={busy || !link.trim()}>{busy ? "Adding…" : "Add"}</Button>
      </div>
      <p role="status" className={`text-footnote ${failed ? "text-destructive" : "text-label-secondary"}`}>{message}</p>
    </form>
  );
}
