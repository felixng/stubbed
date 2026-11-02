"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SHOW_TYPE_LABELS, similarShows, tidyShowTitle, type NewShow, type Show, type ShowType } from "@/lib/entries";
import { createClient } from "@/lib/supabase/client";
import { DidYouMean } from "./DidYouMean";
import { SelectedValue } from "./SelectedValue";
import { Typeahead, type TypeaheadOption } from "./Typeahead";

// Pick a show: type-ahead over search_shows, or "Add '<title>'" to create it
// on save (type defaults to musical, editable). After a search that found
// nothing, picking a show offers to remember that search as its nickname
// (#35), so "Lez Miz" finds it next time. A new show gets a tidy title and
// "Did you mean…?" with close existing shows; the same show is used outright
// (#146).
export function ShowField({
  labelledBy,
  value,
  onChange,
}: {
  labelledBy: string;
  value: Show | NewShow | null;
  onChange: (show: Show | NewShow | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Show[]>([]);
  // The last search that found nothing, and the nickname offer it led to.
  const [missed, setMissed] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ alias: string; showId: string } | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await createClient().rpc("search_shows", { q });
      if (cancelled) return;
      const found = (data as Show[] | null) ?? [];
      setResults(found.slice(0, 8));
      if (!found.length) setMissed(q);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // A new show (typed, or from an import): tidy it and look for existing ones.
  const newTitle = value && !value.id ? value.title : null;
  const [similar, setSimilar] = useState<{ title: string; shows: Show[] } | null>(null);
  useEffect(() => {
    if (!newTitle || !value) return;
    let cancelled = false;
    const supabase = createClient();
    void Promise.all([tidyShowTitle(supabase, newTitle), similarShows(supabase, newTitle)]).then(([tidy, found]) => {
      if (cancelled) return;
      const same = found.find((s) => s.same);
      if (same) return onChange({ id: same.id, title: same.title, type: same.type });
      if (tidy && tidy !== newTitle) return onChange({ ...value, title: tidy });
      setSimilar({ title: newTitle, shows: found.map(({ id, title, type }) => ({ id, title, type })) });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per new title, not per render
  }, [newTitle]);

  if (value) {
    return (
      <div className="flex flex-col gap-3">
        <SelectedValue
          primary={value.title}
          secondary={value.id ? SHOW_TYPE_LABELS[value.type] : "New show"}
          onChange={() => {
            setQuery(value.title);
            setOffer(null);
            onChange(null);
          }}
        />
        {offer && offer.showId === value.id && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-fill px-4 py-3">
            <p className="min-w-0 flex-1 text-footnote text-label-secondary">
              Remember “{offer.alias}” for this show? Searching it will find {value.title} next time.
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void createClient().rpc("remember_show_alias", { show_id: offer.showId, alias: offer.alias });
                setOffer(null);
              }}
            >
              Remember
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOffer(null)}>
              No thanks
            </Button>
          </div>
        )}
        {!value.id && similar?.title === value.title && (
          <DidYouMean
            keep={`“${value.title}” as a new show`}
            options={similar.shows.map((s) => ({
              key: s.id,
              label: `${s.title} · ${SHOW_TYPE_LABELS[s.type]}`,
              onPick: () => onChange(s),
            }))}
          />
        )}
        {!value.id && (
          <div role="group" aria-label="Show type" className="flex flex-wrap gap-2">
            {(Object.keys(SHOW_TYPE_LABELS) as ShowType[]).map((t) => (
              <Chip key={t} selected={value.type === t} onClick={() => onChange({ ...value, type: t })}>
                {SHOW_TYPE_LABELS[t]}
              </Chip>
            ))}
          </div>
        )}
      </div>
    );
  }

  const q = query.trim();
  const matches = q.length >= 2 ? results : [];
  const exact = matches.some((s) => s.title.toLowerCase() === q.toLowerCase());
  const options: TypeaheadOption[] = matches.map((s) => ({
    key: s.id,
    primary: s.title,
    secondary: SHOW_TYPE_LABELS[s.type],
    onSelect: () => {
      // Not when the miss was just this search overtyped ("Hamiltonx").
      if (missed && !missed.toLowerCase().startsWith(q.toLowerCase())) setOffer({ alias: missed, showId: s.id });
      setMissed(null);
      onChange(s);
    },
  }));
  if (q && !exact) {
    options.push({
      key: "add",
      primary: `Add “${q}”`,
      secondary: "New show",
      emphasis: true,
      onSelect: () => onChange({ title: q, type: "musical" }),
    });
  }

  return (
    <Typeahead
      labelledBy={labelledBy}
      query={query}
      onQueryChange={setQuery}
      options={options}
      placeholder="Search shows"
    />
  );
}
