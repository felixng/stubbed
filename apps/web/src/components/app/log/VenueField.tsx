"use client";

import { useEffect, useId, useState } from "react";

import { asVenue, similarVenues, type NearbyVenue, type VenueChoice, type Venue } from "@/lib/entries";
import { createClient } from "@/lib/supabase/client";
import { DidYouMean } from "./DidYouMean";
import { SelectedValue } from "./SelectedValue";
import { fieldClass, Typeahead, type TypeaheadOption } from "./Typeahead";

export type { NearbyVenue, VenueChoice };

const where = (v: { city?: string | null; country?: string | null }) =>
  [v.city, v.country].filter(Boolean).join(", ") || null;

// Pick a venue. With an empty field it lists nearby theatres (from the photo)
// and suggestions (last used with this show, recent venues); typing searches
// the catalogue. "Add '<name>'" creates one on save, with city and country
// prefilled from where the photo was taken or the last venue used. A venue
// added by hand first offers close existing ones near the photo or in its
// city ("Did you mean…?"), and the same venue is used outright (#146).
export function VenueField({
  labelledBy,
  value,
  onChange,
  nearby,
  suggestions,
  place,
}: {
  labelledBy: string;
  value: VenueChoice | null;
  onChange: (venue: VenueChoice | null) => void;
  nearby: NearbyVenue[];
  suggestions: Venue[];
  place: { city: string | null; country: string | null };
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(Venue & { distance_km: number | null })[]>([]);
  const near = nearby[0];

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await createClient().rpc("search_venues", {
        q,
        near_lat: near?.lat ?? null,
        near_lng: near?.lng ?? null,
      });
      if (!cancelled) setResults(((data as typeof results | null) ?? []).slice(0, 8));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, near?.lat, near?.lng]);

  // A venue added by hand: look for existing ones, again as the city is typed.
  const handAdded = value && !value.id && !value.osm_id ? value : null;
  const [similar, setSimilar] = useState<{ name: string; venues: Venue[] } | null>(null);
  useEffect(() => {
    if (!handAdded) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const coords = near?.lat != null && near?.lng != null ? { lat: near.lat, lng: near.lng } : null;
      const found = await similarVenues(createClient(), handAdded.name, coords, handAdded.city);
      if (cancelled) return;
      const venues = found.map(asVenue);
      const same = found.findIndex((v) => v.same);
      if (same >= 0) return onChange(venues[same]);
      setSimilar({ name: handAdded.name, venues });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per name and city typed, not per render
  }, [handAdded?.name, handAdded?.city, near?.lat, near?.lng]);

  if (value) {
    const isNew = !value.id;
    return (
      <div className="flex flex-col gap-3">
        <SelectedValue
          primary={value.name}
          secondary={isNew && !value.osm_id ? "New venue" : where(value)}
          onChange={() => {
            setQuery(isNew ? value.name : "");
            onChange(null);
          }}
        />
        {isNew && !value.osm_id && similar?.name === value.name && (
          <DidYouMean
            keep={`“${value.name}” as a new venue`}
            options={similar.venues.map((v) => ({
              key: v.id,
              label: [v.name, where(v)].filter(Boolean).join(" · "),
              onPick: () => onChange(v),
            }))}
          />
        )}
        {/* A venue added by hand needs a city and country for stats. */}
        {isNew && !value.osm_id && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span id={`${id}-city`} className="text-footnote text-label-secondary">
                City
              </span>
              <input
                className={fieldClass}
                aria-labelledby={`${id}-city`}
                required
                value={value.city ?? ""}
                onChange={(e) => onChange({ ...value, city: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span id={`${id}-country`} className="text-footnote text-label-secondary">
                Country
              </span>
              <input
                className={fieldClass}
                aria-labelledby={`${id}-country`}
                required
                value={value.country ?? ""}
                onChange={(e) => onChange({ ...value, country: e.target.value })}
              />
            </label>
          </div>
        )}
      </div>
    );
  }

  const q = query.trim();
  let options: TypeaheadOption[];
  let heading: string | null = null;

  if (q.length < 2) {
    // Empty field: what's near the photo first, then the usual suspects.
    const seen = new Set<string>();
    options = [
      ...nearby.map((v) => ({
        key: v.id ?? v.osm_id ?? v.name,
        primary: v.name,
        secondary: `${v.distance_m} m from the photo`,
        onSelect: () => onChange(v),
      })),
      ...suggestions.map((v) => ({
        key: v.id,
        primary: v.name,
        secondary: where(v),
        onSelect: () => onChange(v),
      })),
    ].filter((o) => (seen.has(o.key) ? false : (seen.add(o.key), true)));
    heading = nearby.length ? "Near the photo" : options.length ? "Recent" : null;
  } else {
    options = results.map((v) => ({
      key: v.id,
      primary: v.name,
      secondary: where(v),
      onSelect: () => onChange(v),
    }));
    // Nearby theatres not yet in the catalogue match by name too.
    for (const v of nearby) {
      if (!v.id && v.name.toLowerCase().includes(q.toLowerCase())) {
        options.unshift({
          key: v.osm_id ?? v.name,
          primary: v.name,
          secondary: `${v.distance_m} m from the photo`,
          onSelect: () => onChange(v),
        });
      }
    }
    if (!options.some((o) => o.primary.toLowerCase() === q.toLowerCase())) {
      options.push({
        key: "add",
        primary: `Add “${q}”`,
        secondary: "New venue",
        emphasis: true,
        onSelect: () => onChange({ name: q, city: place.city, country: place.country }),
      });
    }
  }

  return (
    <Typeahead
      labelledBy={labelledBy}
      query={query}
      onQueryChange={setQuery}
      options={options}
      heading={heading}
      placeholder="Search venues"
    />
  );
}
