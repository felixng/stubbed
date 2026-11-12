import Link from "next/link";
import { CrawlBar } from "@/components/app/admin/CrawlBar";
import type { TaskTone } from "@/lib/admin-crawl";

export type PipelineStep = {
  name: string;
  what: string;
  summary: string;
  progress?: { done: number; total: number; stuck: number };
  tone?: TaskTone;
  href?: string;
};

const dot: Record<TaskTone, string> = {
  good: "bg-tint border-tint",
  waiting: "bg-surface border-tint",
  bad: "bg-destructive border-destructive",
  neutral: "bg-surface border-separator",
};

// The six steps as a vertical flow: each step's count under its name, a bar for the three crawl steps.
// Vertical on purpose, so it reads the same at 375px and on desktop.
export function PipelineDiagram({ steps, label }: { steps: PipelineStep[]; label: string }) {
  return (
    <ol aria-label={label} className="flex flex-col">
      {steps.map((step, index) => {
        const body = (
          <div className="flex min-w-0 flex-1 flex-col gap-1 pb-4">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-headline">{step.name}</span>
              <span className="text-footnote text-label-secondary">{step.what}</span>
            </div>
            <p className="text-subheadline">{step.summary}</p>
            {step.progress && (
              <CrawlBar done={step.progress.done} stuck={step.progress.stuck} total={step.progress.total}
                label={`${step.name}: ${step.progress.done} of ${step.progress.total} done${step.progress.stuck ? `, ${step.progress.stuck} stuck` : ""}`} />
            )}
          </div>
        );
        return (
          <li key={step.name} className="flex gap-3">
            <div aria-hidden className="flex flex-col items-center">
              <span className={`mt-1.5 size-3 shrink-0 rounded-full border-2 ${dot[step.tone ?? "neutral"]}`} />
              {index < steps.length - 1 && <span className="w-0.5 flex-1 bg-separator" />}
            </div>
            {step.href ? <Link href={step.href} className="flex min-w-0 flex-1 hover:bg-fill focus-visible:outline-2 focus-visible:outline-focus">{body}</Link> : body}
          </li>
        );
      })}
    </ol>
  );
}
