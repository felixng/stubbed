import Link from "next/link";

export const settingsRow = "flex min-h-12 items-center justify-between gap-3 px-4 py-3 text-body hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

export function SettingsLink({ href, children, external = false }: { href: string; children: React.ReactNode; external?: boolean }) {
  return (
    <Link href={href} className={`${settingsRow} text-label`}>
      {children}
      <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-label-secondary">
        <path d={external ? "M7 17 17 7M7 7h10v10" : "m9 5 7 7-7 7"} />
      </svg>
    </Link>
  );
}

export function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="px-1 text-subheadline font-medium text-label-secondary">{title}</h2>
      <div className="divide-y divide-separator overflow-hidden rounded-md border border-separator bg-surface shadow-sm">{children}</div>
    </section>
  );
}

