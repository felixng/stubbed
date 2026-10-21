"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";

// Copies the markdown version of the design system, to paste into an AI tool.
export function CopyMarkdown({ markdown }: { markdown: string }) {
  const [notice, setNotice] = useState("");
  // Coming back to the page later shows the plain button again.
  const done = useFreshOnReturn(() => setNotice(""));

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setNotice("Copied. Paste it into any AI tool.");
    } catch {
      setNotice("Couldn’t copy. Open the markdown instead.");
    }
    done();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={copy}>Copy for AI tools</Button>
      <p role="status" className="min-h-[18px] text-footnote text-label-secondary">
        {notice}
      </p>
    </div>
  );
}
