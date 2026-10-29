-- Stand-up as its own show type, beside comedy (which stays for comedic
-- plays and sketch shows). Both apps read the list from this enum.
alter type public.show_type add value if not exists 'standup' after 'comedy';
