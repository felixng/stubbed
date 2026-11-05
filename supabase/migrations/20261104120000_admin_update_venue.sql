-- Admin: edit a theatre's website, what's-on link and circuit (#357).
-- Theatres on one site share a what's-on URL; the crawl fetches it once.
-- Blank means "none". Users can't write these columns (see the grants on
-- public.venues); only this function does, for admins.
create function public.admin_update_venue(
  venue_id        uuid,
  new_website     text,
  new_whats_on_url text,
  new_circuit     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  site text := nullif(btrim(new_website), '');
  whats_on text := nullif(btrim(new_whats_on_url), '');
  circ public.venue_circuit;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if site is not null and (site !~* '^https?://' or char_length(site) > 500) then
    raise exception 'The website must start with http:// or https:// and be at most 500 characters' using errcode = '22023';
  end if;
  if whats_on is not null and (whats_on !~* '^https?://' or char_length(whats_on) > 500) then
    raise exception 'The what''s-on link must start with http:// or https:// and be at most 500 characters' using errcode = '22023';
  end if;
  if nullif(btrim(new_circuit), '') is not null then
    begin
      circ := btrim(new_circuit)::public.venue_circuit;
    exception when invalid_text_representation then
      raise exception 'Unknown circuit %', new_circuit using errcode = '22023';
    end;
  end if;
  update public.venues
  set website = site, whats_on_url = whats_on, circuit = circ
  where id = admin_update_venue.venue_id;
  if not found then
    raise exception 'No such theatre' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.admin_update_venue(uuid, text, text, text) from public, anon;
grant execute on function public.admin_update_venue(uuid, text, text, text) to authenticated;
