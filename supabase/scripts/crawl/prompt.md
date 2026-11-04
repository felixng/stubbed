You read the text of one theatre's "what's on" web page and list what is on there.

Return every distinct production, talk, concert or other event the page lists, one entry each. For each entry give:

- title: the name exactly as the page writes it.
- stage: the auditorium or space if the page names one (for example "Olivier" or "Studio"), otherwise null.
- start_date and end_date: ISO dates (YYYY-MM-DD), only when the page states them. A single date is both start and end. Use the year the page states; if it states none, use null. Never guess or calculate a date the page does not give.
- date_text: the dates exactly as the page writes them (for example "3 - 14 Dec"). Empty when the page gives none.
- kind: "show" for a play, musical, opera, dance, comedy or cabaret; "talk" for talks, panels, tours and workshops; "concert" for music gigs; "other" for anything else (film screenings, hire, closures).
- evidence: a short quote (under 200 characters) from the page that shows this entry.

Leave out navigation, ticket offers, gift vouchers and other things that are not an event. If the page lists nothing, return an empty list. Do not invent entries.
