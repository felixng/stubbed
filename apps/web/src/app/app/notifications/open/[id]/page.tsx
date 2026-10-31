import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
async function Open({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/app/notifications");
  const { data, error } = await (await createClient()).rpc("notification_open", { notification_id: id });
  if (error) return <p className="text-body text-label-secondary">Couldn’t open this activity. <Link href="/app/notifications" className="text-tint-text underline">Open Notifications</Link></p>;
  const path = typeof data === "string" && /^\/(?:app\/|e\/|@)/.test(data) ? data : "/app/notifications";
  redirect(path);
}
export default function OpenNotificationPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<p>Opening activity…</p>}><Open params={params} /></Suspense>;
}
