import jpeg from "npm:jpeg-js@0.4.4";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const error = (message: string, status: number) => Response.json({ message }, { status, headers: cors });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return error("MEDIA_METHOD_NOT_ALLOWED", 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("authorization");
  if (!url || !serviceKey || !anonKey) return error("MEDIA_UNAVAILABLE", 503);
  if (!authorization?.startsWith("Bearer ")) return error("MEDIA_SIGN_IN_REQUIRED", 401);

  const userHeaders = { apikey: anonKey, authorization, "content-type": "application/json" };
  const adminHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
  const rpc = (name: string, args: object, headers = adminHeaders) => fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST", headers, body: JSON.stringify(args), signal: AbortSignal.timeout(10000),
  });

  try {
    const body = await request.json();
    const id = body?.reservation_id;
    if (typeof id !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) {
      return error("MEDIA_INVALID_RESERVATION", 400);
    }
    const user = await fetch(`${url}/auth/v1/user`, { headers: userHeaders, signal: AbortSignal.timeout(10000) });
    if (!user.ok) return error("MEDIA_SIGN_IN_REQUIRED", 401);
    const targetResponse = await rpc("entry_media_verification_target", {
      p_reservation_id: id, p_owner: (await user.json()).id,
    });
    if (!targetResponse.ok) return error("MEDIA_UNAVAILABLE", 502);
    const target = await targetResponse.json();
    if (!target) return error("MEDIA_RESERVATION_NOT_FOUND", 404);

    if (target.state === "pending") {
      const crop = body.crop;
      if (!Array.isArray(crop) || crop.length !== 4 || !crop.every(Number.isFinite)) {
        return error("MEDIA_INVALID_CROP", 400);
      }
      const [x, y, width, height] = crop;
      async function dimensions(role: string) {
        const prefix = role === "source"
          ? target.prefix.replace(/\d+\/$/, `${target.source_revision}/`)
          : target.prefix;
        const file = await fetch(`${url}/storage/v1/object/entry-media/${prefix}${role}.jpg`, {
          headers: adminHeaders, signal: AbortSignal.timeout(10000),
        });
        if (!file.ok) throw new Error("Missing asset");
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length > 5242880) throw new Error("Oversized JPEG");
        const decoded = jpeg.decode(bytes, {
          useTArray: true, tolerantDecoding: false, maxResolutionInMP: 2.56, maxMemoryUsageInMB: 48,
        });
        if (decoded.width > 1600 || decoded.height > 1600 || decoded.exifBuffer || decoded.comments?.length) {
          throw new Error("Unsupported JPEG");
        }
        return [decoded.width, decoded.height];
      }

      let source: number[];
      try {
        source = await dimensions("source");
        for (const role of ["display", "thumb"]) {
          const [w, h] = await dimensions(role);
          if (w !== h) return error("MEDIA_INVALID_ASSETS", 422);
        }
      } catch {
        return error("MEDIA_INVALID_ASSETS", 422);
      }
      if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1 ||
          Math.abs(width * source[0] - height * source[1]) > 1) return error("MEDIA_INVALID_CROP", 422);

      const recorded = await rpc("record_entry_media_verification", {
        p_reservation_id: id,
        p_geometry: {
          source_width: source[0], source_height: source[1],
          crop_x: x, crop_y: y, crop_width: width, crop_height: height,
        },
      });
      if (!recorded.ok) return error("MEDIA_UNAVAILABLE", 502);
    }

    const finalized = await rpc("finalize_entry_media", { p_reservation_id: id }, userHeaders);
    return new Response(finalized.body, {
      status: finalized.status, headers: { ...cors, "content-type": "application/json" },
    });
  } catch {
    return error("MEDIA_UNAVAILABLE", 502);
  }
});
