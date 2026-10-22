// Bottom tab bar for the web app at phone width; iOS uses the native TabView.
// Four destinations at most; the selected one is `tint-text`.
export const TAB_ICONS: Record<string, string[]> = {
  home: ["M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"],
  diary: ["M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z", "M5 17a3 3 0 0 1 3-3h11"],
  log: ["M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z", "M12 8v8M8 12h8"],
  stats: ["M5 20V10M12 20V4M19 20v-7"],
  import: ["M12 4v10", "m8 10 4 4 4-4", "M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"],
  trips: [
    "M5 8h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z",
    "M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M4 13h16",
  ],
  profile: [
    "M12 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
    "M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5",
  ],
};

const DEFAULT_TABS = [
  { id: "diary", label: "Diary" },
  { id: "log", label: "Log" },
  { id: "stats", label: "Stats" },
  { id: "profile", label: "Profile" },
];

export function TabBar({
  items = DEFAULT_TABS,
  active = items[0].id,
  onSelect,
  className = "",
}: {
  items?: { id: string; label: string }[];
  active?: string;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Main"
      className={`flex border-t border-separator bg-surface px-2 ${className}`}
    >
      {items.map((item) => {
        const on = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={on ? "page" : undefined}
            onClick={onSelect ? () => onSelect(item.id) : undefined}
            className={`flex min-h-[49px] flex-1 flex-col items-center gap-0.5 pt-1.5 pb-1 text-[10px] leading-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              on ? "text-tint-text" : "text-label-secondary"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              width={24}
              height={24}
              aria-hidden="true"
              focusable="false"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {(TAB_ICONS[item.id] ?? TAB_ICONS.diary).map((d) => (
                <path key={d} d={d} />
              ))}
            </svg>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
