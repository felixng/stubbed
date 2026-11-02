import "server-only";

import { defineLive } from "next-sanity/live";
import { cmsClient } from "./client";

// The viewer token is server-only. Preview refreshes are handled by Studio;
// normal browsers only subscribe to published, public content changes.
export const cmsLive = cmsClient ? defineLive({
  client: cmsClient,
  serverToken: process.env.SANITY_API_READ_TOKEN,
  browserToken: false,
  strict: true,
}) : null;
