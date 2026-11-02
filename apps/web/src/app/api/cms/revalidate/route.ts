import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { parseBody } from "next-sanity/webhook";

export async function POST(request: NextRequest) {
  const secret = process.env.SANITY_REVALIDATE_SECRET;
  if (!secret) return new Response("Content webhook is not configured", { status: 503 });
  try {
    const { isValidSignature } = await parseBody(request, secret);
    if (!isValidSignature) return new Response("Invalid signature", { status: 401 });
    // Webhooks use immediate expiration; the next visitor sees published copy.
    revalidateTag("cms-copy", { expire: 0 });
    return Response.json({ revalidated: true });
  } catch {
    return new Response("Invalid webhook", { status: 400 });
  }
}
