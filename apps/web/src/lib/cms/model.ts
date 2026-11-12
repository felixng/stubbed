import { copyDefinitions } from "./definitions";

export type CopySection = keyof typeof copyDefinitions;
export type Copy<S extends CopySection> = {
  [K in keyof (typeof copyDefinitions)[S]["fields"]]: string;
};

export const documents = {
  landingPage: { title: "Landing page", path: "/" },
  pressPage: { title: "Press kit", path: "/press" },
  aboutPage: { title: "About", path: "/about" },
  faqPage: { title: "FAQ and guides", path: "/faq" },
  privacyPage: { title: "Privacy policy", path: "/privacy" },
  termsPage: { title: "Terms of service", path: "/terms" },
  siteSettings: { title: "Site settings", path: "/" },
} as const;

export type ContentDocument = keyof typeof documents;

export function defaultsFor<S extends CopySection>(section: S): Copy<S> {
  return Object.fromEntries(
    Object.entries(copyDefinitions[section].fields).map(([key, field]) => [key, field.value]),
  ) as Copy<S>;
}

// CMS data is untrusted: only known strings can override copy. An empty string
// is a deliberate choice by the editor (a cleared field), not a missing value.
// Object shape, image sources, routes and application rules never come from it.
export function mergeCopy<S extends CopySection>(section: S, value: unknown): Copy<S> {
  const result = defaultsFor(section);
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const key of Object.keys(result) as (keyof Copy<S>)[]) {
    const candidate = (value as Record<string, unknown>)[key as string];
    if (typeof candidate === "string" && candidate.length <= 20_000) {
      result[key] = candidate;
    }
  }
  return result;
}

export function seedDocuments() {
  return Object.keys(documents).map((id) => ({
    _id: id,
    _type: id,
    ...Object.fromEntries(
      (Object.keys(copyDefinitions) as CopySection[])
        .filter((section) => copyDefinitions[section].document === id)
        .map((section) => [section, defaultsFor(section)]),
    ),
  }));
}

export function safeEmail(value: string, fallback: string): string {
  return /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value) ? value : fallback;
}

export function safeWebUrl(value: string, fallback: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : fallback;
  } catch {
    return fallback;
  }
}
