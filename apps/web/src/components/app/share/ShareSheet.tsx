"use client";

import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { cardBackground, renderCard, CARD_DOMAIN, type CardData, type CardDesign, type ShareBackground, type ShareInk } from "@/lib/share-card";
import { availableInsightDesigns, availableShowDesigns, isInsightDesign, renderInsightCard, type InsightCardData, type InsightStats } from "@/lib/share-card-insights";
import { renderTripCard, TRIP_CARD_DESIGNS, type TripCardData } from "@/lib/share-card-trip";
import { createClient } from "@/lib/supabase/client";

type Rendered = { file: File; url: string };
type DrawnCard = { isInsights?: boolean; design: CardDesign; variants: Record<string, Rendered>; story?: Rendered };
export type ShareSubject =
  | { kind: "entry"; data: CardData; photoUrl: string | null }
  | { kind: "trip"; data: TripCardData; photoUrls: (string | null)[] }
  | { kind: "insights"; data: InsightCardData };
const backgrounds: ShareBackground[] = ["solid", "gradient", "transparent"];
const keys = ["solid", "gradient", "transparent-light", "transparent-dark"];
const checker = "bg-[repeating-conic-gradient(#bbb_0%_25%,#888_0%_50%)] bg-[length:20px_20px]";
const pill = "min-h-11 rounded-pill px-4 py-2 text-subheadline font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50";

export function ShareSheet({ subject, slug, publicHref = null }: { subject: ShareSubject; slug: string; publicHref?: string | null }) {
  const [drawn, setDrawn] = useState<{ subject: ShareSubject; cards: DrawnCard[] } | null>(null);
  const [error, setError] = useState<ShareSubject | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [background, setBackground] = useState<ShareBackground>("solid");
  const [ink, setInk] = useState<ShareInk>("light");
  const [notice, setNotice] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const moreId = useId();
  const moreButton = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const resources = useRef(new Set<string>());
  const cards = drawn?.subject === subject ? drawn.cards : null;
  const current = cards?.find(c => c.design.id === active) ?? cards?.[0];
  const key = current?.design.background ? background === "transparent" ? `transparent-${ink}` : background : "photo";
  const card = current?.variants[key];
  const storyCard = current?.story ?? card;
  const storiesShare = useSyncExternalStore(noSubscribe, sharesFiles, () => true);

  useEffect(() => {
    let cancelled = false;
    const pending: string[] = [];
    const make = (blob: Blob, name: string) => {
      const file = new File([blob], name, { type: "image/png" });
      const url = URL.createObjectURL(blob);
      pending.push(url);
      return { file, url };
    };
    (async () => {
      const result: DrawnCard[] = [];
      if (subject.kind === "trip") {
        const photos = await Promise.all(subject.photoUrls.map(loadPhoto));
        for (const design of TRIP_CARD_DESIGNS) {
          const name = `stubbed-${slug}-${design.id}`;
          const photo = make(await renderTripCard(design.id, subject.data, photos), `${name}.png`);
          const story = make(await renderTripCard(design.id, subject.data, photos, { square: true }), `${name}-story.png`);
          result.push({ design, variants: { photo }, story });
        }
      } else {
        const photo = subject.kind === "entry" ? await loadPhoto(subject.photoUrl) : null;
        let insightData: InsightCardData;
        if (subject.kind === "entry") {
          const now = new Date();
          const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          const { data, error } = await createClient().rpc("own_insights", { selected_year: now.getFullYear(), today });
          if (error || !data) throw new Error("Couldn’t load sharing stats");
          insightData = { stats: data as InsightStats, year: now.getFullYear(), handle: subject.data.handle };
        } else insightData = subject.data;
        const designs = subject.kind === "entry" ? availableShowDesigns(subject.data, photo != null, insightData) : availableInsightDesigns(insightData);
        for (const design of designs) {
          const variants: Record<string, Rendered> = {};
          for (const variant of design.background ? keys : ["photo"]) {
            const bg: ShareBackground = variant.startsWith("transparent") ? "transparent" : variant === "gradient" ? "gradient" : "solid";
            const textInk: ShareInk = variant.endsWith("dark") ? "dark" : "light";
            const options = { background: bg, ink: textInk, includingEmpty: subject.kind === "entry" };
            const blob = subject.kind === "entry" && !isInsightDesign(design.id) ? await renderCard(design.id, subject.data, photo, options) : await renderInsightCard(design.id, insightData, options);
            const exportID = design.id === "encore" && subject.kind === "entry" && subject.data.timesSeen === 1 ? "first-visit" : design.id;
            const name = isInsightDesign(design.id) ? `stubbed-${design.id}-${insightData.year ?? "all-time"}` : `stubbed-${slug}-${exportID}`;
            variants[variant] = make(blob, `${name}-${variant}.png`);
          }
          result.push({ design, variants, isInsights: isInsightDesign(design.id) });
        }
      }
      if (cancelled) { pending.forEach(URL.revokeObjectURL); return; }
      pending.forEach(url => resources.current.add(url));
      setDrawn({ subject, cards: result });
    })().catch(err => {
      pending.forEach(URL.revokeObjectURL);
      if (!cancelled) { console.error("Drawing sharing cards failed", err); setError(subject); }
    });
    // Next hides cached pages rather than unmounting them. The displayed
    // URLs must remain valid on return; cancelled, unpublished URLs can go.
    return () => { cancelled = true; };
  }, [subject, slug]);

  useEffect(() => {
    if (!drawn) return;
    const live = new Set(drawn.cards.flatMap(c => [...Object.values(c.variants), ...(c.story ? [c.story] : [])].map(v => v.url)));
    for (const url of resources.current) {
      if (!live.has(url)) { URL.revokeObjectURL(url); resources.current.delete(url); }
    }
  }, [drawn]);

  const alignSelection = useEffectEvent(() => {
    const element = scroller.current?.querySelector<HTMLElement>(`[data-design="${current?.design.id}"]`);
    if (element && scroller.current) scroller.current.scrollLeft = element.offsetLeft;
  });
  useLayoutEffect(() => { alignSelection(); }, [cards]);

  const sharingInsights = subject.kind === "insights" || current?.isInsights === true;
  const text = sharingInsights ? "" : subject.kind === "entry" ? `${subject.data.title}${subject.data.venue ? ` at ${subject.data.venue}` : ""}. Tracked on Stubbed ${CARD_DOMAIN}`
    : subject.kind === "trip" ? `${subject.data.name}: ${subject.data.shows.length} shows. Tracked on Stubbed ${CARD_DOMAIN}` : "";
  const title = subject.kind === "entry" ? subject.data.title : subject.kind === "trip" ? subject.data.name : "My theatre stats";
  function record(action: "stories" | "more" | "download" | "copy_text" | "copy_link") {
    if (!current) return;
    void track(createClient(), "card_shared", { action, design: current.design.id,
      background: cardBackground(current.design, background), transparent: Boolean(current.design.background && background === "transparent"),
      rating: subject.kind === "entry" && current.design.id === "name" });
  }
  function save(image: Rendered) {
    const link = document.createElement("a"); link.href = image.url; link.download = image.file.name; link.click();
  }
  async function share(withText: boolean) {
    const image = withText ? card : storyCard;
    if (!image) return;
    setNotice(null);
    if (!navigator.canShare?.({ files: [image.file] })) {
      save(image); record(withText ? "more" : "stories"); setNotice("Image saved."); return;
    }
    try {
      await navigator.share(withText && text ? { files: [image.file], text } : { files: [image.file] });
      record(withText ? "more" : "stories");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setNotice("Couldn’t open sharing. Download the image instead.");
    }
  }
  async function copy(value: string, action: "copy_text" | "copy_link") {
    try { await navigator.clipboard.writeText(value); record(action); setNotice(action === "copy_link" ? "Link copied." : "Text copied."); }
    catch { setNotice("Couldn’t copy. Try again."); }
  }
  function goTo(id: string) {
    const node = scroller.current?.querySelector<HTMLElement>(`[data-design="${id}"]`);
    if (node) scroller.current?.scrollTo({ left: node.offsetLeft, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    setActive(id);
  }
  function onScroll() {
    const node = scroller.current;
    if (!node?.children.length) return;
    const closest = Array.from(node.children).reduce((a, b) => Math.abs((a as HTMLElement).offsetLeft - node.scrollLeft) < Math.abs((b as HTMLElement).offsetLeft - node.scrollLeft) ? a : b) as HTMLElement;
    if (closest.dataset.design) setActive(closest.dataset.design);
  }
  const pick = (selected: boolean) => `${pill} ${selected ? "bg-label text-background" : "bg-fill text-label"}`;
  return (
    <section aria-label="Share" className="flex flex-col gap-4">
      {cards?.length ? <>
        <div ref={scroller} onScroll={onScroll} role="region" aria-roledescription="carousel" aria-label="Card designs"
          className="relative flex snap-x snap-mandatory gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {cards.map((item, i) => {
            const clear = Boolean(item.design.background && background === "transparent");
            const variant = item.design.background ? clear ? `transparent-${ink}` : background : "photo";
            return <div key={item.design.id} data-design={item.design.id} role="group" aria-label={`${i + 1} of ${cards.length}: ${item.design.name}`}
              className={`relative aspect-square w-full shrink-0 snap-center overflow-hidden rounded-[6%] ${clear ? checker : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- locally drawn PNG */}
              <img src={item.variants[variant].url} alt={`Share card, ${item.design.name.toLowerCase()}${clear ? ", no background" : ""}: ${item.isInsights ? "My theatre stats" : title}`} className="size-full" />
            </div>;
          })}
        </div>
        <div className="flex flex-wrap justify-center gap-1" aria-label="Choose a card">
          {cards.map(item => <button key={item.design.id} type="button" onClick={() => goTo(item.design.id)} aria-current={current?.design.id === item.design.id}
            className={pick(current?.design.id === item.design.id)}>{item.design.name}</button>)}
        </div>
      </> : <div className="flex aspect-square items-center justify-center rounded-md bg-fill text-label-secondary" role="status">
        {error === subject ? "Couldn’t draw cards. Reload to try again." : cards ? "No shows to share for this period." : "Preparing share cards…"}
      </div>}
      {current?.design.background && <>
        <fieldset className="flex flex-wrap justify-center gap-2"><legend className="mb-2 text-center text-footnote text-label-secondary">Background</legend>
          {backgrounds.map(value => <button key={value} type="button" aria-pressed={background === value} onClick={() => setBackground(value)} className={pick(background === value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
        </fieldset>
        {background === "transparent" && <fieldset className="flex justify-center gap-2"><legend className="mb-2 text-center text-footnote text-label-secondary">Text colour</legend>
          {(["light", "dark"] as ShareInk[]).map(value => <button key={value} type="button" aria-pressed={ink === value} onClick={() => setInk(value)} className={pick(ink === value)}>{value === "light" ? "Light" : "Dark"}</button>)}
        </fieldset>}
      </>}
      <Button disabled={!storyCard} onClick={() => share(false)} className="w-full">{storiesShare ? "Share to Stories" : "Download for Stories"}</Button>
      <div className="flex justify-center">
        <button ref={moreButton} type="button" aria-expanded={more} aria-controls={moreId} onClick={() => setMore(v => !v)} className={pick(false)}>More</button>
      </div>
      {more && <div id={moreId} className="grid grid-cols-2 gap-2" onKeyDown={event => { if (event.key === "Escape") { setMore(false); moreButton.current?.focus(); } }}>
        <Button variant="secondary" disabled={!card} onClick={() => { setMore(false); void share(true); }}>Share…</Button>
        <Button variant="secondary" disabled={!card} onClick={() => { if (card) { save(card); record("download"); setNotice("Image saved."); } setMore(false); }}>Download image</Button>
        {text && <Button variant="secondary" onClick={() => { void copy(text, "copy_text"); setMore(false); }}>Copy text</Button>}
        {publicHref && !sharingInsights && <Button variant="secondary" onClick={() => { void copy(new URL(publicHref, location.origin).href, "copy_link"); setMore(false); }}>Copy link</Button>}
      </div>}
      <p className="text-center text-footnote text-label-secondary">Tag <span className="font-semibold text-label">{CARD_DOMAIN}</span> in your story.</p>
      <p role="status" className="min-h-5 text-center text-footnote text-label-secondary">{notice}</p>
    </section>
  );
}
function noSubscribe() { return () => {}; }
function sharesFiles() { return Boolean(navigator.canShare?.({ files: [new File([], "card.png", { type: "image/png" })] })); }
function loadPhoto(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise(resolve => { const image = new Image(); image.crossOrigin = "anonymous"; image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = url; });
}
