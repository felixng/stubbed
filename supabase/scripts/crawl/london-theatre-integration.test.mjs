import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runPsql } from './db.mjs';
import { runFrontier } from './frontier.mjs';
import { createFrontierStore } from './frontier-store.mjs';
import { londonTheatre } from './sources/london-theatre.mjs';

const host = 'www.londontheatre.co.uk';
const html = name => readFileSync(new URL(`./fixtures/london-theatre/${name}.html`, import.meta.url), 'utf8');
const response = body => new Response(body, { headers: { 'content-type': 'text/html' } });

test('London enumeration and detail stages resume independently from Postgres', {
  skip: !process.env.CRAWL_INTEGRATION_DB_URL,
}, async () => {
  const db = new URL(process.env.CRAWL_INTEGRATION_DB_URL);
  assert.equal(db.hostname, '127.0.0.1', 'fixtures need a disposable local database');
  const previous = process.env.SUPABASE_DB_URL;
  process.env.SUPABASE_DB_URL = db.href;
  const id = randomUUID();
  const key = 'fixture_' + id.replaceAll('-', '');
  const source = { source_key: key, allowed_hosts: [host], collection_enabled: true, min_interval_ms: 1000 };
  let changedEvent = false;
  async function request(url) {
    if (url.pathname === '/robots.txt') return response('User-agent: *');
    if (url.pathname === '/venues') {
      return response(url.search ? `<main><div data-test-id="article-list-grid"><ul><li><article>
        <a href="/venues/fourth-venue">Fourth Venue</a></article></li></ul></div></main>` : html('directory'));
    }
    if (url.pathname === '/venues/strand-theatre' && !url.search) return response(html('venue'));
    if (url.pathname.startsWith('/venues/')) {
      return response(`<main><h1>Test Venue</h1><p data-test-id="venue-address">1 Road, London, GB</p>
        <p data-test-id="no-events">No upcoming events</p></main>`);
    }
    return changedEvent ? response('<main>Changed event layout</main>')
      : response(html('event').replaceAll('/show/101-one-night', url.pathname));
  }

  const run = (stage, maxPages) => runFrontier({
    source, adapter: londonTheatre, seeds: londonTheatre.seeds, stage, maxPages, request,
  });
  const count = async () => {
    const [counts] = await runPsql(`select jsonb_build_object(
      'enumeration', (select enumeration_status from public.crawl_generations where source_id = '${id}'),
      'directory', (select count(*) from public.crawl_tasks where source_id = '${id}' and stage = 'directory' and status = 'succeeded'),
      'venues', (select count(*) from public.crawl_tasks where source_id = '${id}' and stage = 'venue' and status = 'succeeded'),
      'events', (select count(*) from public.crawl_tasks where source_id = '${id}' and stage = 'event' and status = 'succeeded'),
      'queuedEvents', (select count(*) from public.crawl_tasks where source_id = '${id}' and stage = 'event' and status = 'pending')
    );`);
    return counts;
  };

  try {
    await runPsql(`insert into public.crawl_sources
      (id, source_key, adapter_version, collection_enabled, allowed_hosts, min_interval_ms)
      values ('${id}', '${key}', '${londonTheatre.version}', true, array['${host}'], 1000);`);
    assert.equal((await run('directory', 1)).checkpoint, true);
    assert.deepEqual(await count(), { enumeration: 'enumerating', directory: 1, venues: 0, events: 0, queuedEvents: 0 });
    assert.equal((await run('venue', 3)).statuses.succeeded, 3);
    assert.deepEqual(await count(), { enumeration: 'enumerating', directory: 1, venues: 3, events: 0, queuedEvents: 3 });

    assert.equal((await run('directory', 5)).statuses.succeeded, 1);
    assert.deepEqual(await count(), { enumeration: 'enumerated', directory: 2, venues: 3, events: 0, queuedEvents: 3 });
    assert.equal((await run('venue', 5)).statuses.succeeded, 2);
    assert.equal((await run('event', 5)).statuses.succeeded, 3);
    assert.deepEqual(await count(), { enumeration: 'enumerated', directory: 2, venues: 5, events: 3, queuedEvents: 0 });

    const [eventTask] = await runPsql(`update public.crawl_tasks set status = 'pending', available_at = now()
      where source_id = '${id}' and canonical_url = 'https://${host}/show/101-one-night' returning to_jsonb(id);`);
    changedEvent = true;
    assert.equal((await run('event', 5)).statuses.retry_wait, 1);
    const [saved] = await runPsql(`select jsonb_build_object(
      'extractions', (select count(*) from public.crawl_extractions where task_id = '${eventTask}'),
      'publication', (select count(*) from public.crawl_publication_queue q join public.crawl_extractions e
        on e.id = q.extraction_id where e.task_id = '${eventTask}'),
      'publicationEnabled', (select publication_enabled from public.crawl_sources where id = '${id}')
    );`);
    assert.deepEqual(saved, { extractions: 1, publication: 1, publicationEnabled: false });
  } finally {
    try {
      await runPsql(`begin;
        delete from public.crawl_publication_queue q using public.crawl_extractions e, public.crawl_tasks t
          where q.extraction_id = e.id and e.task_id = t.id and t.source_id = '${id}';
        delete from public.crawl_extractions e using public.crawl_tasks t where e.task_id = t.id and t.source_id = '${id}';
        delete from public.crawl_tasks where source_id = '${id}';
        delete from public.crawl_generations where source_id = '${id}';
        delete from public.crawl_sources where id = '${id}';
        delete from public.crawl_hosts where host = '${host}';
        commit;`);
    } finally {
      if (previous === undefined) delete process.env.SUPABASE_DB_URL;
      else process.env.SUPABASE_DB_URL = previous;
    }
  }
});

test('London fixtures publish end to end: a geocoded venue links to the existing OSM venue and shows publish', {
  skip: !process.env.CRAWL_INTEGRATION_DB_URL,
}, async () => {
  const db = new URL(process.env.CRAWL_INTEGRATION_DB_URL);
  assert.equal(db.hostname, '127.0.0.1', 'fixtures need a disposable local database');
  const previous = process.env.SUPABASE_DB_URL;
  process.env.SUPABASE_DB_URL = db.href;
  const id = randomUUID();
  const key = 'fixture_' + id.replaceAll('-', '');
  const source = { source_key: key, allowed_hosts: [host], collection_enabled: true, min_interval_ms: 1000 };
  const geocodes = [];
  const geocoder = async input => { geocodes.push(input.postcode); return { lat: 51.5116, lng: -0.1175, provider: 'postcodes.io', query: input.postcode, precision: 'postcode_centroid' }; };
  const request = async url => {
    if (url.pathname === '/robots.txt') return response('User-agent: *');
    if (url.pathname === '/venues') return response(html('directory'));
    if (url.pathname === '/venues/strand-theatre') return response(html('venue'));
    if (url.pathname.startsWith('/venues/')) {
      return response(`<main><h1>Other Venue</h1><p data-test-id="venue-address">1 Road, London, GB</p><p data-test-id="no-events">No upcoming events</p></main>`);
    }
    return response(html('event').replaceAll('/show/101-one-night', url.pathname));
  };
  const store = createFrontierStore();
  const venueId = randomUUID();
  try {
    await runPsql(`insert into public.crawl_sources (id, source_key, adapter_version, collection_enabled, publication_enabled, allowed_hosts, min_interval_ms)
      values ('${id}', '${key}', '${londonTheatre.version}', true, true, array['${host}'], 1000);
      insert into public.venues (id, name, city, country, lat, lng, osm_id) values ('${venueId}', 'Strand Theatre', 'London', 'GB', 51.5115, -0.1175, 'node/4440');`);
    for (const stage of ['directory', 'venue', 'event']) {
      await runFrontier({ source, adapter: londonTheatre, seeds: londonTheatre.seeds, stage, maxPages: 10, request, geocoder, store });
    }
    assert.ok(geocodes.includes('WC2R 0NS'), 'the venue page was geocoded in the worker');
    const identities = await store.publishIdentities(key, 100);
    assert.equal(identities.failed, 0);
    const [out] = await runPsql(`select jsonb_build_object(
      'linked', (select venue_id = '${venueId}' from public.crawl_source_entities where source_id = '${id}' and entity_kind = 'venue' and external_key = 'strand-theatre'),
      'provenance', (select evidence#>>'{geocode,provider}' from public.crawl_source_entities where source_id = '${id}' and entity_kind = 'venue' and external_key = 'strand-theatre'),
      'duplicates', (select count(*) from public.venues where name = 'Strand Theatre'),
      'oneNight', (select resolution_status from public.crawl_source_entities where source_id = '${id}' and entity_kind = 'event' and external_key = '101'));`);
    assert.deepEqual(out, { linked: true, provenance: 'geocoded:postcodes.io', duplicates: 1, oneNight: 'linked' });
  } finally {
    try {
      await runPsql(`begin;
        delete from public.crawl_source_entities where source_id = '${id}';
        delete from public.crawl_publication_queue q using public.crawl_extractions e, public.crawl_tasks t
          where q.extraction_id = e.id and e.task_id = t.id and t.source_id = '${id}';
        delete from public.crawl_extractions e using public.crawl_tasks t where e.task_id = t.id and t.source_id = '${id}';
        delete from public.crawl_tasks where source_id = '${id}';
        delete from public.crawl_generations where source_id = '${id}';
        delete from public.shows where id in (select s.id from public.shows s join public.show_candidates c on c.show_id = s.id where c.source_ref like 'venue-first:${key}:%');
        delete from public.show_candidates where source_ref like 'venue-first:${key}:%';
        delete from public.crawl_sources where id = '${id}';
        delete from public.venues where id = '${venueId}' or (source = 'crawler' and name in ('Test Venue', 'Fourth Venue', 'East London Arts', 'Riverside Rooms', 'Other Venue'));
        delete from public.crawl_hosts where host = '${host}';
        commit;`);
    } finally {
      if (previous === undefined) delete process.env.SUPABASE_DB_URL;
      else process.env.SUPABASE_DB_URL = previous;
    }
  }
});
