import type { Metadata } from "next";
import Link from "next/link";

import { LogForm } from "@/components/app/log/LogForm";

export const metadata: Metadata = { title: "Log a show" };

export default function LogPage() {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-title font-display text-label">Log a show</h1>
        <Link href="/app/import" className="-my-2 -mr-3 inline-flex min-h-11 items-center rounded-pill px-3 text-subheadline font-semibold text-tint-text hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          Import shows
        </Link>
      </div>
      <LogForm />
    </section>
  );
}
