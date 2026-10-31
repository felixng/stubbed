"use client";

import { useEffect, useState } from "react";
import { notificationCategories, categoryLabels, type NotificationCategory } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/client";
type Choice = { category: NotificationCategory; inbox: boolean; push: boolean };
export function CategorySettings({ channel }: { channel: "inbox" | "push" }) {
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void createClient().from("notification_category_preferences").select("category,inbox,push").then(({data,error}) => {
      if (cancelled) return;
      setFailed(!!error);
      if (!error) setChoices(notificationCategories.map(category => ({ category, inbox: true, push: true, ...data?.find(c => c.category === category) })));
    });
    return () => { cancelled = true; };
  }, []);
  async function toggle(choice: Choice) {
    if (!choices) return;
    const previous = choices;
    const next = { ...choice, [channel]: !choice[channel] };
    setBusy(true); setFailed(false);
    setChoices(choices.map(c => c.category === choice.category ? next : c));
    // Update only this channel: saving one client must not overwrite the other
    // channel's independently changed setting.
    const { error } = await createClient().rpc("notification_set_category", { kind: choice.category, channel, enabled: next[channel] });
    if (error) { setChoices(previous); setFailed(true); }
    setBusy(false);
  }
  return <fieldset disabled={busy || !choices} className="flex flex-col gap-2">
    <legend className="mb-2 text-headline text-label">{channel === "inbox" ? "In-app" : "Push categories"}</legend>
    <p className="text-subheadline text-label-secondary">{channel === "inbox" ? "Choose what appears in your shared inbox. Existing history stays." : "Your choices stay saved when push is switched off."}</p>
    {!choices && !failed && <p>Loading preferences…</p>}
    {failed && <p role="alert" className="text-destructive">Couldn’t save or load preferences. Your previous choices are unchanged. Reopen this page to retry.</p>}
    {choices?.map(c => <label key={c.category} className="flex min-h-14 items-center justify-between gap-4 rounded-md border border-separator bg-surface p-4 text-body text-label"><span>{categoryLabels[c.category]}</span><input type="checkbox" role="switch" checked={c[channel]} onChange={() => void toggle(c)} className="size-5 accent-tint-text" /></label>)}
  </fieldset>;
}
