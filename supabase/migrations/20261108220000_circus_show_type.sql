-- Circus as a show type of its own, after concert (owner, 2026-11-08, #452). Circus shows were
-- landing as Other beside magic, panto and cabaret. Both apps read the list from this enum; iOS
-- reads any type it doesn't know as Other.
alter type public.show_type add value if not exists 'circus' after 'concert';
