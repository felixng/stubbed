"use client";

import Link from "next/link";

import { Avatar } from "@/components/profile/Avatar";
import { useBlockToggle } from "./ProfileActions";

export type BlockedPerson = { id: string; handle: string; display_name: string | null; avatar_url: string | null };

// Settings → Blocked accounts: everyone the user has blocked, each with
// Unblock. Read with `my_blocks()`, newest first.
export function BlockedAccounts({ people }: { people: BlockedPerson[] }) {
  if (people.length === 0) {
    return <p className="text-subheadline text-label-secondary">No one blocked. Block someone from the … menu on their profile.</p>;
  }
  return (
    <ul className="overflow-hidden rounded-md border border-separator bg-surface shadow-sm">
      {people.map((p) => (
        <BlockedRow key={p.id} person={p} />
      ))}
    </ul>
  );
}

function BlockedRow({ person }: { person: BlockedPerson }) {
  const toggle = useBlockToggle(person.id, person.handle, true);
  return (
    <li className="flex items-center gap-3 border-b border-separator px-4 py-2 last:border-b-0">
      <Link href={`/@${person.handle}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        <Avatar name={person.display_name || `@${person.handle}`} url={person.avatar_url} size={40} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-subheadline font-semibold text-label">@{person.handle}</span>
          {person.display_name && <span className="truncate text-footnote text-label-secondary">{person.display_name}</span>}
        </span>
      </Link>
      <button
        type="button"
        disabled={toggle.busy}
        onClick={toggle.run}
        aria-label={`Unblock @${person.handle}`}
        className="min-h-11 shrink-0 cursor-pointer rounded-pill bg-tint-fill px-4 text-subheadline font-semibold text-tint-text hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
      >
        Unblock
      </button>
      {toggle.dialog}
    </li>
  );
}
