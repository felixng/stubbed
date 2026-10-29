import type { MetadataRoute } from "next";

// The web app manifest: the name and icons a browser uses when someone adds
// Stubbed to their home screen. Icons are the app icon (E1), made by brand/.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stubbed",
    short_name: "Stubbed",
    description: "Log, rate and share every show you see.",
    start_url: "/app",
    display: "browser",
    background_color: "#f2f2f7",
    theme_color: "#f2f2f7",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
