import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

// The link preview for the landing page (iMessage, WhatsApp, X, LinkedIn…).
// Footlight Sweep light colours; generated once at build time. Uses the
// font bundled with next/og, since the system font can't be embedded.
export const alt = "Stubbed — your theatre diary";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  // The ticket mark (A2) beside the wordmark, as on the site's header.
  const mark = await readFile(join(process.cwd(), "public/brand/stubbed-mark.png"));
  const markSrc = `data:image/png;base64,${mark.toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#f2f2f7",
          color: "#1c1c1e",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -140,
            top: -140,
            width: 560,
            height: 560,
            borderRadius: 9999,
            backgroundImage: "linear-gradient(45deg, #e8247f, #ff5a5a 50%, #ffa040)",
            boxShadow: "0 0 0 40px rgba(255, 90, 90, 0.16)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <img src={markSrc} width={74} height={60} alt="" />
          <div style={{ fontSize: 56, letterSpacing: "-0.045em" }}>stubbed</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 96,
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
              maxWidth: 900,
            }}
          >
            A theatre diary made for sharing.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, color: "#6c6c70" }}>
            <div style={{ width: 16, height: 16, borderRadius: 9999, background: "#dc2f4f" }} />
            Log, rate and share every show you see.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
