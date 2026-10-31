"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/profile/Avatar";
import { EmptyState } from "@/components/app/EmptyState";
import { PlaceholderRows } from "@/components/ui/PlaceholderRows";
import { createClient } from "@/lib/supabase/client";
import { notificationDayGroup, notificationDestination, notificationText, type InboxItem } from "@/lib/notifications";

export function Inbox() {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("notification_inbox");
    setFailed(!!error);
    if (!error) { setItems(data as InboxItem[]); setMore(data.length === 30); }
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => { if (active && document.visibilityState === "visible") void load(); };
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  async function markAll() {
    if (!items?.length) return;
    setBusy(true);
    const { error } = await createClient().rpc("notification_read_all");
    setBusy(false);
    if (error) { setFailed(true); return; }
    window.dispatchEvent(new Event("stubbed-notifications"));
    await load();
  }
  async function open(n: InboxItem) {
    const { error } = await createClient().rpc("notification_read", { notification_id: n.id, seen_revision: n.revision });
    if (error) { setFailed(true); return; }
    setItems(current => current?.map(item => item.id === n.id ? { ...item, unread: false } : item) ?? null);
    window.dispatchEvent(new Event("stubbed-notifications"));
  }
  async function loadMore() {
    if (!items?.length) return;
    setBusy(true);
    const last = items[items.length - 1];
    const { data, error } = await createClient().rpc("notification_inbox", { before_time: last.updated_at, before_id: last.id });
    setBusy(false);
    if (error) { setFailed(true); return; }
    setItems(current => [...current ?? [], ...(data as InboxItem[]).filter(n => !current?.some(old => old.id === n.id))]);
    setMore(data.length === 30);
  }
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button onClick={markAll} disabled={busy || !items?.some(n => n.unread)} className="min-h-11 text-tint-text underline disabled:text-label-secondary disabled:no-underline">Mark all as read</button>
      <Link href="/app/settings/notifications" className="min-h-11 content-center text-tint-text underline">Notification settings</Link>
    </div>
    {failed && <div role="alert" className="text-body text-label-secondary">Couldn’t update notifications. Check your connection. <button onClick={load} className="min-h-11 text-tint-text underline">Try again</button></div>}
    {!items && !failed && <PlaceholderRows />}
    {items?.length === 0 && !failed && <EmptyState title="You’re all caught up">Likes, comments and follow activity will appear here.</EmptyState>}
    {items?.map((n, i) => {
      const group = notificationDayGroup(n.updated_at);
      return <div key={n.id}>
        {(i === 0 || notificationDayGroup(items[i - 1].updated_at) !== group) && <h2 className="mb-2 text-headline text-label">{group}</h2>}
        <Link href={notificationDestination(n)} onClick={() => void open(n)} className="flex min-h-20 items-start gap-3 rounded-md border border-separator bg-surface p-4 hover:bg-fill focus-visible:outline-2 focus-visible:outline-focus">
          <Avatar name={n.display_name || n.handle} url={n.avatar_url} size={40} />
          <span className="flex-1"><span className={`${n.unread ? "font-semibold" : ""} text-body text-label`}>{notificationText(n)}</span><span className="mt-1 block text-footnote text-label-secondary"><span aria-hidden="true">{n.category === "like" ? "♡ · " : n.category === "comment" ? "◌ · " : "＋ · "}</span>{new Date(n.updated_at).toLocaleString()}</span></span>
          {n.unread && <span className="mt-2 size-2 shrink-0 rounded-full bg-tint-text"><span className="sr-only">Unread</span></span>}
        </Link>
      </div>;
    })}
    {more && <button onClick={loadMore} disabled={busy} className="min-h-11 text-tint-text underline">{busy ? "Loading…" : "Load older activity"}</button>}
  </div>;
}
