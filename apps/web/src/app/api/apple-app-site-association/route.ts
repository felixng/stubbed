// /.well-known/apple-app-site-association (rewritten here in next.config.ts):
// tells iOS which links open in the Stubbed app when it's installed, so a
// shared entry, trip or profile opens in the app instead of Safari
// (apps/ios, #77). Static.
const APP_ID = "AAW3XNQ6D3.com.felixng.stubbed";

export function GET() {
  return Response.json({
    applinks: {
      details: [
        {
          appIDs: [APP_ID],
          components: [
            { "/": "/e/*", comment: "A public entry" },
            { "/": "/t/*", comment: "A public trip" },
            { "/": "/@*", comment: "A profile, its followers and following" },
          ],
        },
      ],
    },
  });
}
