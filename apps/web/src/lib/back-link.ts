// Where an entry page's back link goes. The linking page says where the user
// came from with a `from` search param, and only these values are read, so
// the link can never point off the app. With no `from` (a direct or shared
// load, or an unknown value) it falls back to the diary on Profile.

export type From = "home" | "import" | "admin-import" | `trip-${string}`;

export type BackTarget = { href: string; label: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PROFILE_BACK: BackTarget = { href: "/app/profile", label: "Profile" };

// `href` plus `?from=…`, for links into an entry page.
export function withFrom(href: string, from: From): string {
  return `${href}${href.includes("?") ? "&" : "?"}from=${encodeURIComponent(from)}`;
}

// A trip is only trusted when the entry is in it, which also gives its name.
export function entryBack(
  from: string | string[] | undefined,
  trips: { id: string; name: string }[] = [],
): BackTarget {
  if (typeof from !== "string") return PROFILE_BACK;
  if (from === "home") return { href: "/app", label: "Home" };
  if (from === "import") return { href: "/app/import", label: "Import" };
  if (from === "admin-import") return { href: "/app/admin/import", label: "Import" };
  if (from.startsWith("trip-")) {
    const id = from.slice(5);
    const trip = UUID.test(id) ? trips.find((t) => t.id === id) : undefined;
    if (trip) return { href: `/app/trips/${trip.id}`, label: trip.name };
  }
  return PROFILE_BACK;
}
