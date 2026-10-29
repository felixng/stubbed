`wikidata-live.json` is a subset of a real SPARQL detail response captured from
query.wikidata.org on 2026-10-29, using the English label/alias, website, date,
IBDB and type-signal fields in `detailQuery`. It keeps seven items from a
50-item mapping review: five stage works and two excluded media items. Values
and RDF binding metadata are retained. Wikidata data is CC0.

`mapping.json` contains explicitly synthetic edge cases (including fake test
identifiers) for precedence, missing dates, duplicate labels and aliases. It
is not a Wikidata data source.
