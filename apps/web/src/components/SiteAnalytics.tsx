"use client";

import { Suspense, useEffect } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

// Paths that aren't public traffic: the signed-in app, sign-in and onboarding.
const PRIVATE = /^\/(app|login|auth|welcome)(\/|$)/;

function publicOnly(event: BeforeSendEvent) {
  return PRIVATE.test(new URL(event.url).pathname) ? null : event;
}

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

type GaWindow = { dataLayer?: unknown[] } & Record<string, unknown>;

// gtag() queues onto dataLayer; gtag.js replays the queue once it loads.
// It must push the `arguments` object itself, not an array.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]) {
  const w = window as unknown as GaWindow;
  w.dataLayer = w.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  w.dataLayer.push(arguments);
}

let gaStarted = false;

// Consent is denied before anything is sent and never granted, so GA sets no
// cookies and gets cookieless pings only: no consent banner (docs/DECISIONS.md).
// Page views are sent by hand on public paths, never automatically, and the
// `ga-disable-<id>` flag turns GA off entirely (enhanced-measurement events
// included) while someone is on a private path.
function GooglePageViews({ id }: { id: string }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!gaStarted) {
      gaStarted = true;
      gtag("consent", "default", {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      });
      gtag("set", "ads_data_redaction", true);
      gtag("js", new Date());
      gtag("config", id, { send_page_view: false });
    }
    const hidden = PRIVATE.test(pathname);
    (window as unknown as GaWindow)[`ga-disable-${id}`] = hidden;
    if (!hidden) {
      gtag("event", "page_view", { page_location: window.location.href, page_title: document.title });
    }
  }, [id, pathname]);
  return null;
}

// Page traffic for the public pages (landing, legal pages, public profiles at
// /@handle), counted twice on purpose:
// - Vercel Web Analytics. Cookieless. Does nothing until Web Analytics is
//   enabled on the Vercel project, and only sends from Vercel deployments.
// - Google Analytics 4, cookieless (see GooglePageViews). Does nothing until
//   NEXT_PUBLIC_GA_MEASUREMENT_ID is set.
export function SiteAnalytics() {
  return (
    <>
      <Analytics beforeSend={publicOnly} />
      {GA_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Suspense>
            <GooglePageViews id={GA_ID} />
          </Suspense>
        </>
      )}
    </>
  );
}
