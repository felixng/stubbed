import { ImageResponse } from "next/og";

// The link preview for the landing page (iMessage, WhatsApp, X, LinkedIn…).
// Footlight Coral light colours; generated once at build time. Uses the
// font bundled with next/og, since the system font can't be embedded.
export const alt = "Stubbed — your theatre diary";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
          background: "#fff9f6",
          color: "#1f1210",
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
            background: "#ffe0d5",
            boxShadow: "0 0 0 40px rgba(255, 122, 92, 0.16)",
          }}
        />
        <div style={{ fontSize: 56, letterSpacing: "-0.045em" }}>stubbed</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 96,
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
              maxWidth: 900,
            }}
          >
            Your theatre life, shared.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, color: "#5e4039" }}>
            <div style={{ width: 16, height: 16, borderRadius: 9999, background: "#ff7a5c" }} />
            Log, rate and share every show you see.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
