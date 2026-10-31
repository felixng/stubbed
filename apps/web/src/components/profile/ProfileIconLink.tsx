import Link from "next/link";

export function ProfileIconLink({ kind }: { kind: "edit" | "settings" }) {
  const label = kind === "edit" ? "Edit profile" : "Settings";
  return (
    <Link
      href={kind === "edit" ? "/app/settings/profile" : "/app/settings"}
      aria-label={label}
      title={label}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-tint-text hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {kind === "edit" ? (
          <>
            <path d="m15 5 4 4M4 20l4.5-1 12-12a2.8 2.8 0 0 0-4-4l-12 12L4 20Z" />
          </>
        ) : (
          <>
            <path d="m9.5 3-.6 2.2-1.4.8-2.2-.6-2.5 4.3 1.6 1.6v1.5l-1.6 1.6 2.5 4.3 2.2-.6 1.4.8.6 2.1h5l.6-2.1 1.4-.8 2.2.6 2.5-4.3-1.6-1.6v-1.5l1.6-1.6-2.5-4.3-2.2.6-1.4-.8L14.5 3h-5Z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </Link>
  );
}
