import Link from "next/link";
import { stegaClean } from "next-sanity";
import type { ReactNode } from "react";

import { buttonClass } from "@/components/ui/Button";
import type { Block, PageSection } from "@/lib/cms/sections";

const linkClass = "rounded-sm text-tint-text underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function Inline({ block }: { block: Block }) {
  return <>{block.children.map((span) => {
    let node: ReactNode = span.text;
    for (const mark of span.marks) {
      if (mark === "strong") node = <strong>{node}</strong>;
      else if (mark === "em") node = <em>{node}</em>;
      else {
        const def = block.markDefs.find((d) => d._key === mark);
        if (!def) continue;
        const href = stegaClean(def.href);
        node = href.startsWith("/") ? <Link href={href} className={linkClass}>{node}</Link> : <a href={href} className={linkClass}>{node}</a>;
      }
    }
    return <span key={span._key} className="contents">{node}</span>;
  })}</>;
}

// Groups consecutive list blocks into one <ul>/<ol>.
export function RichText({ blocks }: { blocks: Block[] }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.listItem) {
      const kind = block.listItem;
      const items: Block[] = [];
      while (i < blocks.length && blocks[i].listItem === kind) items.push(blocks[i++]);
      i--;
      const List = kind === "number" ? "ol" : "ul";
      out.push(<List key={block._key} className={`ml-5 flex flex-col gap-1 ${kind === "number" ? "list-decimal" : "list-disc"}`}>
        {items.map((item) => <li key={item._key}><Inline block={item} /></li>)}
      </List>);
    } else if (block.style === "h3") {
      out.push(<h3 key={block._key} className="font-display text-headline text-label"><Inline block={block} /></h3>);
    } else {
      out.push(<p key={block._key}><Inline block={block} /></p>);
    }
  }
  return <>{out}</>;
}

export function SectionPage({ sections }: { sections: PageSection[] }) {
  return (
    <div className="flex flex-col gap-8">
      {sections.map((section) => (
        <section key={section._key} className={`flex flex-col gap-4 text-body text-label-secondary ${section.divider ? "border-t border-separator pt-6" : ""}`}>
          {section.heading && <h2 className="font-display text-title-2 text-label">{section.heading}</h2>}
          <RichText blocks={section.body} />
          {section.buttons.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {section.buttons.map((button) => (
                <Link key={button._key} href={stegaClean(button.href)} className={buttonClass(button.variant)}>{button.label}</Link>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
