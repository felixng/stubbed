Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("ENTRY_MEDIA_CLEANUP_SECRET");
  if (!url || !serviceKey || !secret) return new Response(null, { status: 503 });
  if (request.headers.get("x-entry-media-cleanup-secret") !== secret) {
    return new Response(null, { status: 401 });
  }

  const headers = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
  };

  try {
    const list = await fetch(`${url}/rest/v1/rpc/list_orphan_entry_media`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_limit: 100 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!list.ok) return new Response(null, { status: 502 });
    const rows: { object_name: string }[] = await list.json();
    if (!rows.length) return Response.json({ processed: 0 });

    const removal = await fetch(`${url}/storage/v1/object/entry-media`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ prefixes: rows.map(({ object_name }) => object_name) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!removal.ok) return new Response(null, { status: 502 });
    return Response.json({ processed: rows.length });
  } catch {
    return new Response(null, { status: 502 });
  }
});
