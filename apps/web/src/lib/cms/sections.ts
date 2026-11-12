import { defaultsFor } from "./model";

// Full-page content: an ordered list of sections the editor controls. Each has
// an optional heading, rich text (paragraphs, subheadings, lists, bold, italic,
// links) and optional buttons. Layout and styling stay in code.

export type Span = { _type: "span"; _key: string; text: string; marks: string[] };
export type Block = {
  _type: "block";
  _key: string;
  style: "normal" | "h3";
  listItem?: "bullet" | "number";
  level?: number;
  markDefs: { _type: "link"; _key: string; href: string }[];
  children: Span[];
};
export type SectionButton = { _key: string; label: string; href: string; variant: "primary" | "ghost" };
export type PageSection = {
  _key: string;
  heading: string;
  divider: boolean;
  body: Block[];
  buttons: SectionButton[];
};

const MAX_TEXT = 20_000;

// Only https, mailto and site-relative links can come from the CMS.
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (/^\/(?![/\\])[^\s]*$/.test(href)) return href;
  try {
    const url = new URL(href);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
    if (url.protocol === "mailto:" && /^mailto:[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(href)) return href;
  } catch { /* not a URL */ }
  return null;
}

const str = (value: unknown, max = MAX_TEXT) => (typeof value === "string" && value.length <= max ? value : "");
const key = (value: unknown, fallback: string) => (typeof value === "string" && /^[\w-]{1,64}$/.test(value) ? value : fallback);

// Draft previews carry invisible click-to-edit markers inside strings. `clean`
// strips them before any value is compared or validated; visible text keeps them.
type Clean = (value: string) => string;
const same: Clean = (value) => value;

function cleanBlock(value: unknown, at: string, clean: Clean): Block | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (clean(String(raw._type)) !== "block" || !Array.isArray(raw.children)) return null;
  const defs = (Array.isArray(raw.markDefs) ? raw.markDefs : []).flatMap((def: unknown) => {
    const d = def as Record<string, unknown> | null;
    const href = d && clean(String(d._type)) === "link" ? safeHref(typeof d.href === "string" ? clean(d.href) : d.href) : null;
    return d && href ? [{ _type: "link" as const, _key: key(d._key, ""), href }] : [];
  }).filter((def) => def._key);
  const children = raw.children.flatMap((child: unknown, i: number) => {
    const c = child as Record<string, unknown> | null;
    if (!c || clean(String(c._type)) !== "span") return [];
    const marks = (Array.isArray(c.marks) ? c.marks : []).filter((m): m is string =>
      typeof m === "string" && (m === "strong" || m === "em" || defs.some((def) => def._key === m)));
    return [{ _type: "span" as const, _key: key(c._key, `${at}-s${i}`), text: str(c.text), marks }];
  });
  return {
    _type: "block",
    _key: key(raw._key, at),
    style: clean(String(raw.style)) === "h3" ? "h3" : "normal",
    ...(["bullet", "number"].includes(clean(String(raw.listItem))) ? { listItem: clean(String(raw.listItem)) as "bullet" | "number", level: 1 } : {}),
    markDefs: defs,
    children,
  };
}

// CMS data is untrusted. Returns null when there is nothing usable, so the page
// falls back to repository copy. An empty array is a real choice (no sections).
export function cleanSections(value: unknown, clean: Clean = same): PageSection[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((entry: unknown, i: number) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const at = `s${i}`;
    return [{
      _key: key(raw._key, at),
      heading: str(raw.heading, 500),
      divider: raw.divider === true,
      body: (Array.isArray(raw.body) ? raw.body : []).flatMap((b, j) => cleanBlock(b, `${at}-b${j}`, clean) ?? []),
      buttons: (Array.isArray(raw.buttons) ? raw.buttons : []).flatMap((b: unknown, j: number) => {
        const r = b as Record<string, unknown> | null;
        const href = r ? safeHref(typeof r.href === "string" ? clean(r.href) : r.href) : null;
        const label = r ? str(r.label, 200) : "";
        return r && href && label ? [{ _key: key(r._key, `${at}-btn${j}`), label, href, variant: clean(String(r.variant)) === "ghost" ? "ghost" as const : "primary" as const }] : [];
      }),
    }];
  });
}

const paragraph = (id: string, text: string, link?: { before: string; href: string; text: string; after: string }): Block =>
  link ? {
    _type: "block", _key: id, style: "normal",
    markDefs: [{ _type: "link", _key: `${id}-l`, href: link.href }],
    children: [
      { _type: "span", _key: `${id}-a`, text: link.before, marks: [] },
      { _type: "span", _key: `${id}-b`, text: link.text, marks: [`${id}-l`] },
      { _type: "span", _key: `${id}-c`, text: link.after, marks: [] },
    ],
  } : { _type: "block", _key: id, style: "normal", markDefs: [], children: [{ _type: "span", _key: `${id}-s`, text, marks: [] }] };

// Repository copy for /about, built from the existing About copy so edits made
// before sections existed still show until the page is edited.
export function aboutDefaultSections(copy: Record<string, string> = defaultsFor("about"), email = "support@getstubbed.app"): PageSection[] {
  return [
    { _key: "intro", heading: "", divider: false, buttons: [], body: [paragraph("intro-1", copy.stubbedIsATheatreDiaryLog)] },
    {
      _key: "why", heading: copy.whyIBuiltThis, divider: false, buttons: [],
      body: [copy.hiImFelixImAnIndependent, copy.forYearsILookedForA, copy.iWantedAQuietFastTool, copy.theresNoVCFundingNoGrowth]
        .map((text, i) => paragraph(`why-${i}`, text)),
    },
    {
      _key: "feedback", heading: copy.builtWithYourFeedback, divider: true,
      body: [paragraph("feedback-1", "", { before: `${copy.stubbedIsInPublicBetaIf} `, href: `mailto:${email}`, text: email, after: "." })],
      buttons: [
        { _key: "signup", label: copy.signUpFree, href: "/signup", variant: "primary" },
        { _key: "faq", label: copy.readTheFAQAndGuides, href: "/faq", variant: "ghost" },
      ],
    },
  ];
}
