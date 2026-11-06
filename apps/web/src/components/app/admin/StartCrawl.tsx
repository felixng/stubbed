"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { CRAWL_MODELS } from "@/lib/crawl-dispatch";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";

const FIELD = "min-h-11 w-full rounded-md border border-separator bg-surface px-3 text-body text-label";
type Theatre = { id: string; name: string; city?: string | null; whats_on_url?: string | null };
export function StartCrawl({ theatres, lastPrompt }: { theatres: Theatre[]; lastPrompt: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState(theatres);
  const [known, setKnown] = useState<Record<string, Theatre>>(() => Object.fromEntries(theatres.map(t => [t.id,t])));
  const [searchError, setSearchError] = useState("");
  const [pipeline, setPipeline] = useState("discover");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      const { data, error } = await createClient().rpc("admin_list_crawl_venues", { q: search.trim() || null, page_size: 50, page_offset: 0 });
      if (!active) return;
      setSearchError(error ? "Couldn’t search theatres. Try again." : "");
      if (!error) { const rows = (data ?? []) as Theatre[]; setMatches(rows); setKnown(old => ({ ...old, ...Object.fromEntries(rows.map(t => [t.id,t])) })); }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);
  const choices = [...selected.map(id => known[id]).filter(Boolean), ...matches.filter(t => !selected.includes(t.id))];
  const [method, setMethod] = useState("rules");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const done = useFreshOnReturn(() => { setSelected([]); setError(""); });
  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/crawl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        venue_ids: selected, pipeline, method: pipeline === "discover" ? "rules" : method, model: form.get("model") || CRAWL_MODELS[0], prompt: form.get("prompt") || null,
        budget_usd: Number(form.get("budget")), branch: form.get("branch"), kind: form.get("kind"),
      }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error || "Couldn’t start the crawl."); return; }
      done(); router.push(`/app/backstage/crawl/${result.id}`); router.refresh();
    } catch { setError("Couldn’t reach the server. Try again."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={start} className="flex flex-col gap-4 rounded-md border border-separator bg-surface p-4">
    <h2 className="text-title-2 font-display">Start a crawl</h2>
    <p className="text-subheadline text-label-secondary">Choose any theatre. We’ll find missing website and what’s-on links, prepare reading rules and crawl up to four sites at a time. AI is used for setup and repair.</p>
    <fieldset disabled={busy} className="flex flex-col gap-3">
      <legend className="text-headline">Theatres ({selected.length}/10)</legend>
      <label className="flex flex-col gap-1">Find a theatre<input className={FIELD} value={search} onChange={e => setSearch(e.target.value)} type="search" /></label>
      <div className="max-h-60 overflow-y-auto">
        {choices.map(t => <label key={t.id} className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={selected.includes(t.id)} disabled={!selected.includes(t.id) && selected.length >= 10} onChange={e => setSelected(ids => e.target.checked ? [...ids, t.id] : ids.filter(id => id !== t.id))} /><span>{t.name}{t.city ? ` · ${t.city}` : ""}{!t.whats_on_url && <span className="block text-footnote text-label-secondary">Find what’s-on link automatically</span>}</span>
        </label>)}
      </div>
      {searchError && <p role="alert">{searchError}</p>}
      <p className="text-footnote text-label-secondary">Showing up to 50 search matches. Selected theatres stay in the list.</p>
      <label>Run type<select className={FIELD} value={pipeline} onChange={e => setPipeline(e.target.value)}><option value="discover">Discover links and crawl</option><option value="legacy">Advanced: compare page readers (requires links)</option></select></label>
      <label>Job<select name="kind" className={FIELD}><option value="whats_on">What’s on</option><option value="show_names">Show names for review</option></select></label>
      {pipeline === "legacy" && <>
      <label>Method<select className={FIELD} value={method} onChange={e => setMethod(e.target.value)}><option value="rules">Rules only</option><option value="rules_model">Rules, then model</option></select></label>
      <label>Model<select name="model" className={FIELD}>{CRAWL_MODELS.map(m => <option key={m}>{m}</option>)}</select></label>
      <label>Prompt<textarea name="prompt" defaultValue={lastPrompt} maxLength={20000} rows={5} className={`${FIELD} py-2`} /></label>
      </>}
      <label>Budget cap (USD)<input name="budget" type="number" defaultValue="1" min="0" max="10" step="0.01" className={FIELD} required /></label>
      <label>Branch<input name="branch" defaultValue="main" maxLength={200} className={FIELD} required /></label>
    </fieldset>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Button type="submit" disabled={busy || !selected.length}>{busy ? "Starting…" : "Start crawl"}</Button>
  </form>;
}

export function RefreshCrawl({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
