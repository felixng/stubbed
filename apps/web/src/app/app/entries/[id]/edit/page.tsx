import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LogForm } from "@/components/app/log/LogForm";
import { BackLink } from "@/components/ui/BackLink";
import { readFrom, withFrom } from "@/lib/back-link";
import { getOwnEntry } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Edit entry" };

async function Edit({ params, searchParams }: PageProps<"/app/entries/[id]/edit">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  // Where the entry page's back link went, passed on so the way back survives an edit.
  const from = readFrom(query.from);
  const found = await getOwnEntry(id);
  if (!found) notFound();
  const { entry, photoUrl } = found;
  return (
    <>
      <div className="flex flex-col gap-1">
        <BackLink href={from ? withFrom(`/app/entries/${entry.id}`, from) : `/app/entries/${entry.id}`}>{entry.show.title}</BackLink>
        <h1 className="text-title font-display text-label">Edit entry</h1>
      </div>
      <LogForm
        from={from ?? undefined}
        initial={{
          id: entry.id,
          show: entry.show,
          venue: entry.venue,
          date: entry.date,
          rating: entry.rating,
          note: entry.note,
          visibility: entry.visibility,
          collectionIds: entry.collections.map((c) => c.id),
          photoUrl,
          photoPath: entry.photo_path,
        }}
      />
    </>
  );
}

export default function EditEntryPage(props: PageProps<"/app/entries/[id]/edit">) {
  return (
    <section className="flex flex-col gap-5">
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
        <Edit {...props} />
      </Suspense>
    </section>
  );
}
