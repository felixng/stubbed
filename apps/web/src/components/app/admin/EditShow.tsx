"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { SHOW_TYPES } from "@/lib/admin-shows";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";

type Props = { id: string; title: string; type: string; otherId: string | null; otherTitle: string | null };

type Side = { id: string; title: string; type: string; wikidata_id: string | null; entries: number; aliases: number };
type Preview = { from: Side; into: Side; types_differ: boolean };
type Candidate = { id: string; title: string; type: string; first_performed: number | null; wikidata_id: string | null };

const FIELD =
  "min-h-11 w-full rounded-md border border-separator bg-surface px-3 text-body text-label focus-visible:outline-2 focus-visible:outline-focus";

const describe = (s: Side) =>
  `“${s.title}” (${s.type}, ${s.wikidata_id ? "Wikidata" : "typed in"}, ${s.entries} ${s.entries === 1 ? "entry" : "entries"}, ${s.aliases} ${s.aliases === 1 ? "nickname" : "nicknames"})`;

// Fix a show on /app/admin/shows: title and type (kept through the Wikidata
// sync), a nickname, or merge it into another show. Every call is an
// admins-only function; merging asks first, naming both shows and what moves.
export function EditShow({ id, title, type, otherId, otherTitle }: Props) {
  const router = useRouter();
  const [confirm, dialog] = useConfirm();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title);
  const [kind, setKind] = useState(type);
  const [nick, setNick] = useState("");
  const [find, setFind] = useState("");
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const done = useFreshOnReturn(() => setOpen(false));
  const working = busy || refreshing;
  const sb = () => createClient();

  function finish(message?: string) {
    done();
    startRefresh(() => {
      setBusy(false);
      if (message) setNote(message);
      router.refresh();
    });
  }

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, after: () => void) {
    setBusy(true);
    setError(null);
    setNote(null);
    const { error } = await fn();
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    after();
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    return run(
      () => sb().rpc("admin_update_show", { show_id: id, new_title: name, new_type: kind }),
      () => {
        setOpen(false);
        finish();
      },
    );
  };

  const addNick = () =>
    run(
      () => sb().rpc("admin_add_show_alias", { for_show: id, new_alias: nick }),
      () => {
        setNick("");
        finish("Nickname added.");
      },
    );

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!find.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error } = await sb().rpc("search_shows", { q: find });
    setBusy(false);
    if (error) return setError(error.message);
    setFound(((data ?? []) as unknown as Candidate[]).filter((c) => c.id !== id));
  }

  async function merge(into: string) {
    setBusy(true);
    setError(null);
    const { data, error } = await sb().rpc("admin_merge_preview", { from_id: id, into_id: into });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    const p = data as unknown as Preview;
    setBusy(false);
    const ok = await confirm({
      title: "Merge these shows?",
      message:
        `${describe(p.from)} will be deleted, and its ${p.from.entries} ${p.from.entries === 1 ? "entry" : "entries"} and nicknames move into ${describe(p.into)}.` +
        (p.types_differ ? ` Their types differ (${p.from.type} and ${p.into.type}); the merged show keeps ${p.into.type}.` : "") +
        " This can’t be undone.",
      action: "Merge",
    });
    if (!ok) return;
    await run(
      () => sb().rpc("admin_merge_shows", { from_id: id, into_id: into, force: p.types_differ }),
      () => {
        setOpen(false);
        finish();
      },
    );
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} className="self-start">
        Edit
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-4 rounded-md bg-fill p-3">
      <form onSubmit={save} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-footnote text-label-secondary">
          Title
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-footnote text-label-secondary">
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={FIELD}>
            {SHOW_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div>
          <Button type="submit" size="sm" disabled={working || !name.trim() || (name === title && kind === type)}>
            Save title and type
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-1">
        <label className="text-footnote text-label-secondary" htmlFor={`nick-${id}`}>
          Add a nickname people search by
        </label>
        <div className="flex gap-2">
          <input id={`nick-${id}`} value={nick} onChange={(e) => setNick(e.target.value)} maxLength={100} className={FIELD} />
          <Button size="sm" variant="secondary" disabled={working || nick.trim().length < 2} onClick={addNick}>
            Add
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-footnote text-label-secondary">Merge this show into another (this one is deleted)</p>
        {otherId && (
          <Button size="sm" variant="secondary" disabled={working} onClick={() => merge(otherId)} className="self-start">
            Merge into “{otherTitle}”
          </Button>
        )}
        <form onSubmit={search} className="flex gap-2">
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find the show to keep" className={FIELD} />
          <Button type="submit" size="sm" variant="secondary" disabled={working || !find.trim()}>
            Find
          </Button>
        </form>
        {found && (found.length === 0 ? <p className="text-footnote text-label-secondary">No other show found.</p> : null)}
        {found && found.length > 0 && (
          <ul className="flex flex-col">
            {found.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 border-t border-separator py-1">
                <span className="text-subheadline text-label">
                  {c.title}{" "}
                  <span className="text-footnote text-label-secondary">
                    {c.type}
                    {c.first_performed ? ` · ${c.first_performed}` : ""} · {c.wikidata_id ? "Wikidata" : "typed in"}
                  </span>
                </span>
                <Button size="sm" variant="ghost" disabled={working} onClick={() => merge(c.id)}>
                  Merge into this
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {note && <p className="text-subheadline text-label">{note}</p>}
      {error && (
        <p role="alert" className="text-subheadline text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button size="sm" variant="ghost" disabled={working} onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      {dialog}
    </div>
  );
}
