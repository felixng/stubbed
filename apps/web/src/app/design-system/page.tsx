import type { Metadata } from "next";

import { Container } from "@/components/landing/Container";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { RatingStars } from "@/components/ui/RatingStars";
import { ShowCard } from "@/components/ui/ShowCard";
import { ShowRow } from "@/components/ui/ShowRow";
import { TAB_ICONS, TabBar } from "@/components/ui/TabBar";
import { Wordmark } from "@/components/ui/Wordmark";
import {
  COLORS,
  COMPONENTS,
  DESIGN_SYSTEM_NAME,
  FONT_STACK,
  ICON_RULES,
  IOS_RULES,
  PRINCIPLES,
  RADII,
  SHADOWS,
  SHADOW_RULES,
  SPACING,
  SPACING_RULES,
  TEXT_STYLES,
  TYPE_RULES,
  WORDMARK,
  designSystemMarkdown,
  themeVars,
} from "@/lib/design-system";
import { SITE_URL } from "@/lib/site";

import { CopyMarkdown } from "./CopyMarkdown";

// The design system, shown with the real components, to share with people and
// AI tools. Public but not linked or in the sitemap; /design-system.md is the
// same content as plain markdown. Follows the visitor's appearance.
export const metadata: Metadata = {
  title: "Design system — Stubbed",
  description: `${DESIGN_SYSTEM_NAME}, the design system of Stubbed: colour, type, spacing, components and rules.`,
  alternates: {
    canonical: "/design-system",
    types: { "text/markdown": "/design-system.md" },
  },
  robots: { index: false },
};

// `**bold**` and `code` in the rule strings, which are written as markdown.
function Inline({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) =>
    part.startsWith("**") ? (
      <strong key={i} className="font-semibold text-label">
        {part.slice(2, -2)}
      </strong>
    ) : part.startsWith("`") ? (
      <code key={i} className="rounded-sm bg-fill px-1 font-mono text-[0.9em] text-label">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

function Rules({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 flex max-w-[680px] list-disc flex-col gap-2 pl-5 text-callout text-label-secondary">
      {items.map((item) => (
        <li key={item}>
          <Inline text={item} />
        </li>
      ))}
    </ul>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-separator py-10">
      <h2 id={id} className="font-display text-title-2 text-label">
        {title}
      </h2>
      {children}
    </section>
  );
}

// One appearance's tokens set on a wrapper, so light and dark previews sit
// side by side whatever the visitor's own appearance is.
function Appearance({
  appearance,
  children,
}: {
  appearance: "light" | "dark";
  children: React.ReactNode;
}) {
  return (
    <div
      style={{ ...themeVars(appearance), colorScheme: appearance } as React.CSSProperties}
      className="flex min-w-0 flex-col gap-6 rounded-lg border border-separator bg-background p-5 text-label"
    >
      <p className="text-footnote font-semibold tracking-wide text-label-secondary uppercase">
        {appearance}
      </p>
      {children}
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="size-8 flex-none rounded-sm border border-separator"
        style={{ background: color }}
      />
      <span className="font-mono text-footnote text-label-secondary">
        <span className="sr-only">{label} </span>
        {color}
      </span>
    </div>
  );
}

function ComponentPreview({ appearance }: { appearance: "light" | "dark" }) {
  return (
    <Appearance appearance={appearance}>
      <Wordmark size={28} />
      <div className="flex flex-wrap gap-3">
        <Button>Log a show</Button>
        <Button variant="secondary">Add to trip</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="neutral">Continue with Google</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm">Follow</Button>
        <Button size="sm" variant="secondary">
          Requested
        </Button>
        <Button size="sm" disabled>
          Save
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip selected>Musical</Chip>
        <Chip>Play</Chip>
        <Chip>Opera</Chip>
        <Chip>Dance</Chip>
      </div>
      <div className="flex items-center gap-4">
        <RatingStars value={4.5} size={20} />
        <RatingStars value={3} size={14} />
      </div>
      <div className="rounded-md border border-separator bg-surface px-4 shadow-sm">
        <ShowRow title="Hamilton" venue="Victoria Palace" date="12 Oct" rating={5} />
        <div className="ml-[72px] border-t border-separator" />
        <ShowRow title="The Seagull" venue="Barbican" date="3 Nov" />
      </div>
      <div className="flex gap-4 overflow-x-auto">
        <ShowCard title="Wicked" venue="Apollo" date="8 Sep" rating={4} />
        <ShowCard title="Death of a Salesman" venue="Hudson" date="21 Aug" rating={3.5} />
      </div>
      <TabBar className="-mx-5 -mb-5 rounded-b-lg" />
    </Appearance>
  );
}

export default function DesignSystemPage() {
  const markdown = designSystemMarkdown(new URL("/design-system", SITE_URL).href);

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header>
        <Container className="flex items-center justify-between gap-4 py-6 sm:py-8">
          <Wordmark size={28} href="/" />
        </Container>
      </header>
      <main className="flex-auto">
        <Container className="pb-16">
          <div className="max-w-[680px] pb-10">
            <p className="text-subheadline font-semibold text-tint-text">{DESIGN_SYSTEM_NAME}</p>
            <h1 className="mt-1 font-display text-large-title text-label">Design system</h1>
            <p className="mt-3 text-callout text-label-secondary">
              Colour, type, spacing, components and rules for Stubbed on iOS and the web. Native
              first: the SwiftUI app sets the direction and the web mirrors it. To brief an AI
              tool, copy the whole system as markdown or give it the markdown link.
            </p>
            <div className="mt-6 flex flex-wrap items-start gap-3">
              <CopyMarkdown markdown={markdown} />
              <a
                href="/design-system.md"
                className="inline-flex min-h-[50px] items-center rounded-pill px-6 text-headline text-tint-text hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Open as markdown
              </a>
            </div>
          </div>

          <Section id="principles" title="Principles">
            <Rules items={PRINCIPLES} />
          </Section>

          <Section id="wordmark" title="Wordmark">
            <div className="mt-4 flex flex-wrap items-end gap-8">
              <Wordmark size={48} />
              <Wordmark size={28} />
              <Wordmark size={16} />
            </div>
            <Rules items={WORDMARK} />
          </Section>

          <Section id="colour" title="Colour">
            <p className="mt-2 max-w-[680px] text-callout text-label-secondary">
              Semantic tokens with a light and a dark value. Use the token, never the raw hex.
            </p>
            <div className="mt-4 overflow-hidden rounded-md border border-separator bg-surface">
              {COLORS.map((c, i) => (
                <div
                  key={c.name}
                  className={`grid gap-3 px-4 py-3 sm:grid-cols-[180px_150px_150px_1fr] sm:items-center ${
                    i ? "border-t border-separator" : ""
                  }`}
                >
                  <div>
                    <p className="font-mono text-subheadline font-semibold text-label">{c.name}</p>
                    <p className="font-mono text-caption text-label-secondary">{c.tailwind}</p>
                  </div>
                  <Swatch color={c.light} label="Light" />
                  <Swatch color={c.dark} label="Dark" />
                  <p className="text-subheadline text-label-secondary">
                    <Inline text={c.use} />
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="type" title="Type">
            <p className="mt-2 max-w-[680px] text-callout text-label-secondary">
              The iOS text styles at their default sizes.{" "}
              <code className="font-mono text-footnote break-words">{FONT_STACK}</code>
            </p>
            <div className="mt-4 flex flex-col">
              {TEXT_STYLES.map((t) => (
                <div
                  key={t.name}
                  className="grid gap-1 border-t border-separator py-3 first:border-t-0 sm:grid-cols-[220px_1fr] sm:items-baseline sm:gap-4"
                >
                  <div>
                    <p className="text-subheadline font-semibold text-label">{t.name}</p>
                    <p className="font-mono text-caption text-label-secondary">
                      {t.tailwind} · {t.size}/{t.lineHeight} · {t.weight}
                    </p>
                  </div>
                  <p
                    className={`${t.tailwind} ${t.weight === 700 ? "font-display" : ""} min-w-0 text-label`}
                  >
                    The curtain rises at half past seven
                  </p>
                </div>
              ))}
            </div>
            <Rules items={TYPE_RULES} />
          </Section>

          <Section id="spacing" title="Spacing">
            <div className="mt-4 flex flex-col gap-2">
              {SPACING.map((s) => (
                <div key={s.name} className="flex items-center gap-4">
                  <p className="w-28 font-mono text-footnote text-label-secondary">
                    {s.name} · {s.px}
                  </p>
                  <span className="h-4 rounded-sm bg-tint" style={{ width: s.px * 4 }} />
                </div>
              ))}
            </div>
            <Rules items={SPACING_RULES} />
          </Section>

          <Section id="radius" title="Radius and shadow">
            <div className="mt-4 flex flex-wrap gap-6">
              {RADII.map((r) => (
                <div key={r.name} className="flex w-32 flex-col gap-2">
                  <span
                    className="h-20 border border-separator bg-fill"
                    style={{ borderRadius: r.px === "999px" ? 999 : r.px }}
                  />
                  <p className="font-mono text-footnote text-label">
                    {r.name} · {r.px}
                  </p>
                  <p className="text-caption text-label-secondary">{r.use}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-6">
              {SHADOWS.map((s) => (
                <div key={s.name} className="flex w-48 flex-col gap-3">
                  <span
                    className="h-20 rounded-md border border-separator bg-surface"
                    style={{ boxShadow: s.value }}
                  />
                  <p className="font-mono text-footnote text-label">{s.name}</p>
                  <p className="text-caption text-label-secondary">
                    <Inline text={s.use} />
                  </p>
                </div>
              ))}
            </div>
            <Rules items={SHADOW_RULES} />
          </Section>

          <Section id="components" title="Components">
            <p className="mt-2 max-w-[680px] text-callout text-label-secondary">
              The web components, each a mirror of a SwiftUI one, in both appearances.
            </p>
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <ComponentPreview appearance="light" />
              <ComponentPreview appearance="dark" />
            </div>
            <div className="mt-6 overflow-hidden rounded-md border border-separator bg-surface">
              {COMPONENTS.map((c, i) => (
                <div
                  key={c.name}
                  className={`grid gap-1 px-4 py-3 sm:grid-cols-[200px_1fr] sm:gap-4 ${
                    i ? "border-t border-separator" : ""
                  }`}
                >
                  <div>
                    <p className="font-mono text-subheadline font-semibold text-label">{c.name}</p>
                    <p className="text-caption text-label-secondary">SwiftUI: {c.swift}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="font-mono text-footnote text-label-secondary">{c.props}</p>
                    <p className="text-subheadline text-label-secondary">
                      <Inline text={c.notes} />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="icons" title="Icons">
            <div className="mt-4 flex flex-wrap gap-6">
              {Object.entries(TAB_ICONS).map(([name, paths]) => (
                <div key={name} className="flex w-16 flex-col items-center gap-2 text-label">
                  <svg
                    viewBox="0 0 24 24"
                    width={24}
                    height={24}
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {paths.map((d) => (
                      <path key={d} d={d} />
                    ))}
                  </svg>
                  <p className="font-mono text-caption text-label-secondary">{name}</p>
                </div>
              ))}
            </div>
            <Rules items={ICON_RULES} />
          </Section>

          <Section id="ios" title="iOS">
            <Rules items={IOS_RULES} />
          </Section>
        </Container>
      </main>
    </div>
  );
}
