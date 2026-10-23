"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { COMMENT_SELECT, type Comment, type Reactions } from "@/lib/reactions";
import { createClient } from "@/lib/supabase/client";
import { CommentForm } from "./CommentForm";
import { CommentItem } from "./CommentThread";
import { EntryReactions } from "./EntryReactions";

// Like and Comment under a show in the home feed, with its comments inline,
// as on Hevy (#87): the latest few, "View all N comments" to open the rest
// right there, and a box to add one. Comment focuses the box. The note and
// trip chips (`children`) sit between the buttons and the comments, like a
// caption.
//
// The thread is kept here, not refreshed from the server: older feed pages
// load in the browser, where a refresh doesn't reach. Posting adds your
// comment at the end, deleting takes one out, and the comment count follows.
// A new server render (new `latest` or `reactions`) starts over from it.
// Leaving the feed and coming back keeps all of it, an unfinished comment
// included: nothing here is a finished task to clear.
export function FeedThread({
  entryId,
  ownerId,
  viewerId,
  reactions,
  latest,
  loginHref,
  shareHref,
  children,
}: {
  entryId: string;
  ownerId: string;
  viewerId: string | null;
  reactions: Reactions;
  latest: Comment[];
  loginHref: string;
  shareHref?: string;
  children?: React.ReactNode;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  // The comments shown and how many there are, once changed here.
  const [local, setLocal] = useState<{ comments: Comment[]; count: number; all: boolean } | null>(null);
  const [from, setFrom] = useState({ latest, reactions });
  if (from.latest !== latest || from.reactions !== reactions) {
    setFrom({ latest, reactions });
    setLocal(null);
  }
  const [loading, setLoading] = useState(false);

  const comments = local?.comments ?? latest;
  const count = local?.count ?? reactions.comments;
  const all = local?.all ?? count <= latest.length;
  // A new object only when the count changes, so a like in flight survives.
  const shown = useMemo(() => ({ ...reactions, comments: count }), [reactions, count]);

  async function viewAll() {
    if (loading) return;
    setLoading(true);
    const { data, error } = await createClient()
      .from("entry_comments")
      .select(COMMENT_SELECT)
      .eq("entry_id", entryId)
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) {
      window.alert("Couldn’t load the comments. Try again.");
      return;
    }
    const list = ((data ?? []) as unknown as (Omit<Comment, "author"> & { author: Comment["author"] | null })[]).flatMap((c) =>
      c.author?.handle ? [{ ...c, author: c.author }] : [],
    );
    setLocal({ comments: list, count: list.length, all: true });
  }

  return (
    <>
      <EntryReactions
        entryId={entryId}
        reactions={shown}
        viewerId={viewerId}
        commentsHref={`/e/${entryId}#comments`}
        loginHref={loginHref}
        shareHref={shareHref}
        onComment={viewerId ? () => box.current?.focus() : undefined}
      />
      {children}
      {(comments.length > 0 || !all) && (
        <div className="flex flex-col gap-3">
          {!all && (
            <button
              type="button"
              onClick={viewAll}
              disabled={loading}
              className="-mx-1 w-fit cursor-pointer rounded-md px-1 text-left text-subheadline text-label-secondary hover:text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait"
            >
              {loading ? "Loading comments…" : count === 1 ? "View 1 comment" : `View all ${count} comments`}
            </button>
          )}
          <ul className="flex flex-col gap-3" aria-label="Comments">
            {comments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                canDelete={viewerId === c.author.id || viewerId === ownerId}
                mine={viewerId === c.author.id}
                onDeleted={() => {
                  const rest = comments.filter((x) => x.id !== c.id);
                  const left = Math.max(0, count - 1);
                  setLocal({ comments: rest, count: left, all: all || left <= rest.length });
                }}
              />
            ))}
          </ul>
        </div>
      )}
      {viewerId ? (
        <CommentForm
          ref={box}
          entryId={entryId}
          viewerId={viewerId}
          onPosted={(c) => setLocal({ comments: [...comments, c], count: count + 1, all })}
        />
      ) : (
        <Link href={loginHref} className="w-fit text-subheadline font-semibold text-tint-text underline-offset-2 hover:underline">
          Sign in to comment
        </Link>
      )}
    </>
  );
}
