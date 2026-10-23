import type { Metadata } from "next";
import Link from "next/link";

import { LogForm } from "@/components/app/log/LogForm";

export const metadata: Metadata = { title: "Log a show" };

export default function LogPage() {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-title font-display text-label">Log a show</h1>
        <Link href="/app/import" className="text-subheadline font-semibold text-tint-text underline-offset-2 hover:underline">
          Import shows
        </Link>
      </div>
      <LogForm />
    </section>
  );
}
