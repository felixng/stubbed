// Photo show detection was removed (#281). Builds already on TestFlight still
// call this route; answering 410 makes them show "no suggestion" instead of
// an error. Delete it once those builds are gone.
export function POST() {
  return Response.json({ error: "gone" }, { status: 410 });
}
