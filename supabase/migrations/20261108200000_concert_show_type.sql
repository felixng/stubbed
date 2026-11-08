-- Concert as a show type of its own, beside stand-up (owner, 2026-11-08, #444):
-- concerts, candlelit recitals and "in concert" stagings were landing as Other.
-- Both apps read the list from this enum; iOS reads any type it doesn't know as Other.
alter type public.show_type add value if not exists 'concert' after 'standup';
