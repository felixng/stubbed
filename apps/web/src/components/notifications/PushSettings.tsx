"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CategorySettings } from "./CategorySettings";
type Preferences = { push_enabled: boolean; previews: boolean; quiet_start: string | null; quiet_end: string | null; time_zone: string };
export function PushSettings() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [zone, setZone] = useState("UTC");
  useEffect(() => {
    let active = true;
    void createClient().from("notification_preferences").select("push_enabled,previews,quiet_start,quiet_end,time_zone").maybeSingle().then(({data,error}) => {
      if (!active) return;
      if (error) { setFailed(true); return; }
      const p = data as Preferences | null ?? { push_enabled: true, previews: false, quiet_start: null, quiet_end: null, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      setPrefs(p); setStart(p.quiet_start?.slice(0,5) ?? ""); setEnd(p.quiet_end?.slice(0,5) ?? ""); setZone(p.time_zone);
    });
    return () => { active = false; };
  }, []);
  async function save(setting: "push_enabled" | "previews" | "quiet_hours", value: boolean | { start: string; end: string; time_zone: string } | null) {
    if (!prefs) return;
    setBusy(true); setFailed(false);
    const { error } = await createClient().rpc("notification_set_general", { setting, value });
    if (error) setFailed(true);
    else if (setting === "quiet_hours") {
      const quiet = typeof value === "object" ? value : null;
      setPrefs({ ...prefs, quiet_start: quiet?.start ?? null, quiet_end: quiet?.end ?? null, time_zone: quiet?.time_zone ?? prefs.time_zone });
    } else setPrefs({ ...prefs, [setting]: value });
    setBusy(false);
  }
  return <div className="flex flex-col gap-5">
    <fieldset disabled={!prefs || busy} className="flex flex-col gap-3">
      <legend className="mb-2 text-headline text-label">Push</legend>
      <label className="flex min-h-14 items-center justify-between gap-4 rounded-md border border-separator bg-surface p-4 text-body text-label">Mobile push<input type="checkbox" role="switch" checked={prefs?.push_enabled ?? true} onChange={e => void save("push_enabled",e.target.checked)} className="size-5 accent-tint-text" /></label>
      <p className="text-subheadline text-label-secondary">Your account preference starts on. Delivery also needs permission on each mobile installation. This switch does not disable your inbox or change category choices.</p>
      <label className="flex min-h-14 items-center justify-between gap-4 rounded-md border border-separator bg-surface p-4 text-body text-label">Show notification previews<input type="checkbox" role="switch" checked={prefs?.previews ?? false} onChange={e => void save("previews",e.target.checked)} className="size-5 accent-tint-text" /></label>
      <p className="text-subheadline text-label-secondary">Previews start off. Comment text is never included.</p>
      <div className="rounded-md border border-separator bg-surface p-4"><h3 className="text-subheadline font-semibold text-label">Sample notification</h3><p className="text-body text-label-secondary">{prefs?.previews ? "Alex liked your Wicked diary entry" : "You have new activity on Stubbed."}</p></div>
      <form onSubmit={e => { e.preventDefault(); void save("quiet_hours", { start, end, time_zone: zone }); }} className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-4">
        <h3 className="text-headline text-label">Quiet hours{prefs?.quiet_start ? " · On" : " · Off"}</h3>
        <label className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-body text-label">Start<input type="time" required value={start} onChange={e => setStart(e.target.value)} className="rounded border border-separator bg-background p-2" /></label>
        <label className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-body text-label">End<input type="time" required value={end} onChange={e => setEnd(e.target.value)} className="rounded border border-separator bg-background p-2" /></label>
        <label className="flex flex-col gap-1 text-body text-label">Time zone<input required value={zone} onChange={e => setZone(e.target.value)} placeholder="Europe/London" className="min-h-11 rounded border border-separator bg-background p-2" /></label>
        <p className="text-subheadline text-label-secondary">Choose a named time zone. Overnight ranges work. Social alerts during quiet hours are skipped without a catch-up burst.</p>
        <button type="submit" disabled={start === end} className="min-h-11 text-tint-text underline disabled:text-label-secondary">Save and enable quiet hours</button>
        {prefs?.quiet_start && <button type="button" onClick={() => void save("quiet_hours",null)} className="min-h-11 text-tint-text underline">Turn off quiet hours</button>}
      </form>
    </fieldset>
    {failed && <p role="alert" className="text-destructive">Couldn’t load or save push preferences. Reopen this page to retry.</p>}
    <CategorySettings channel="push" />
  </div>;
}
