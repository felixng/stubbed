"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { fieldClass } from "@/components/app/log/Typeahead";
import { Button } from "@/components/ui/Button";
import { COMMENT_MAX, COMMENT_SELECT, type Comment } from "@/lib/reactions";
import { createClient } from "@/lib/supabase/client";

// One line that grows as you type, up to a few lines.
const INLINE_FIELD =
  "block field-sizing-content max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-md border border-separator bg-surface px-3 py-2.5 text-subheadline text-label placeholder:text-label-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Adds a comment to a public entry. Postgres checks the viewer may see the
// entry. The box clears once the comment is saved, and the refreshed page
// shows it in the thread; until then the button stays busy. A half-written
// comment survives a stray tab tap (the page is kept, not unmounted).
//
// With `onPosted` (the feed's inline comments, which keep their own list) the
// saved comment is handed back instead of refreshing the page, and the box is
// a single line where Enter posts, as on Hevy; Shift+Enter is a new line.
// `ref` reaches the text box, so the feed's Comment button can focus it.
export function CommentForm({
  entryId,
  viewerId,
  onPosted,
  ref,
}: {
  entryId: string;
  viewerId: string;
  onPosted?: (comment: Comment) => void;
  ref?: React.Ref<HTMLTextAreaElement>;
}) {
  const id = useId();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = saving || refreshing;
  const text = body.trim();
  const inline = Boolean(onPosted);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!text || busy) return;
    setSaving(true);
    const { data, error } = await createClient()
      .from("entry_comments")
      .insert({ entry_id: entryId, user_id: viewerId, body: text })
      .select(COMMENT_SELECT)
      .single();
    if (error) {
      setSaving(false);
      window.alert("Couldn’t post your comment. Try again.");
      return;
    }
    if (onPosted) {
      setSaving(false);
      setBody("");
      onPosted(data as unknown as Comment);
      return;
    }
    startRefresh(() => {
      setSaving(false);
      setBody("");
      router.refresh();
    });
  }

  const count = body.length > COMMENT_MAX - 50 ? `${body.length}/${COMMENT_MAX}` : "";

  return (
    <form onSubmit={post} className={inline ? "flex items-end gap-2" : "flex flex-col gap-2"}>
      <label htmlFor={`${id}-comment`} className="sr-only">
        Add a comment
      </label>
      <textarea
        ref={ref}
        id={`${id}-comment`}
        className={inline ? INLINE_FIELD : `${fieldClass} resize-none py-3`}
        rows={inline ? 1 : 2}
        placeholder="Add a comment…"
        value={body}
        maxLength={COMMENT_MAX}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          // Inline, Enter posts; on the entry's page ⌘/Ctrl+Enter does, and
          // Enter alone is a new line.
          if (inline ? !e.shiftKey : e.metaKey || e.ctrlKey) post(e);
        }}
      />
      {inline ? (
        <>
          <span className="text-footnote text-label-secondary empty:hidden self-center" aria-live="polite">
            {count}
          </span>
          <Button type="submit" size="sm" disabled={!text || busy}>
            {busy ? "Posting…" : "Post"}
          </Button>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-footnote text-label-secondary" aria-live="polite">
            {count}
          </span>
          <Button type="submit" size="sm" disabled={!text || busy}>
            {busy ? "Posting…" : "Post"}
          </Button>
        </div>
      )}
    </form>
  );
}
