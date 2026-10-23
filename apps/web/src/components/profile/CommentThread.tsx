import Link from "next/link";

import type { FollowPerson } from "@/lib/follows";
import { timeAgo, type Comment } from "@/lib/reactions";
import { Avatar } from "./Avatar";
import { CommentForm } from "./CommentForm";
import { DeleteCommentButton } from "./DeleteCommentButton";

// The comments under a public entry on its page, oldest first, with who liked
// it above them and a box to add one. Signed-out visitors are asked to sign
// in. The entry's owner can delete any comment; others delete their own.
export function CommentThread({
  entryId,
  ownerId,
  viewerId,
  comments,
  likers,
  likes,
  loginHref,
}: {
  entryId: string;
  ownerId: string;
  viewerId: string | null;
  comments: Comment[];
  likers: FollowPerson[];
  likes: number;
  loginHref: string;
}) {
  const others = likes - likers.length;
  return (
    <section id="comments" aria-labelledby="comments-heading" className="flex scroll-mt-20 flex-col gap-4 rounded-md border border-separator bg-surface p-4 shadow-sm">
      <h2 id="comments-heading" className="text-headline text-label">
        Comments{comments.length > 0 && <span className="text-label-secondary tabular-nums"> · {comments.length}</span>}
      </h2>
      {likers.length > 0 && (
        <p className="text-subheadline text-label-secondary">
          Liked by{" "}
          {likers.map((p, i) => (
            <span key={p.id}>
              {i > 0 && (i === likers.length - 1 && others <= 0 ? " and " : ", ")}
              <Link href={`/@${p.handle}`} className="font-semibold text-label underline-offset-2 hover:underline">
                @{p.handle}
              </Link>
            </span>
          ))}
          {others > 0 && ` and ${others} ${others === 1 ? "other" : "others"}`}
        </p>
      )}
      {comments.length === 0 ? (
        <p className="text-subheadline text-label-secondary">No comments yet. Say something nice.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} canDelete={viewerId === c.author.id || viewerId === ownerId} mine={viewerId === c.author.id} />
          ))}
        </ul>
      )}
      {viewerId ? (
        <CommentForm entryId={entryId} viewerId={viewerId} />
      ) : (
        <Link
          href={loginHref}
          className="inline-flex min-h-11 w-fit items-center rounded-pill bg-tint-fill px-4 text-subheadline font-semibold text-tint-text hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Sign in to comment
        </Link>
      )}
    </section>
  );
}

// One comment: avatar, handle, how long ago, and the text. Also used by the
// feed's inline comments, which pass `onDeleted`.
export function CommentItem({
  comment,
  canDelete,
  mine,
  onDeleted,
}: {
  comment: Comment;
  canDelete: boolean;
  mine: boolean;
  onDeleted?: () => void;
}) {
  const { author } = comment;
  const name = author.display_name || `@${author.handle}`;
  return (
    <li className="flex gap-3">
      <Link href={`/@${author.handle}`} className="shrink-0 self-start rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        <Avatar name={name} url={author.avatar_url} size={32} />
        <span className="sr-only">@{author.handle}’s profile</span>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-footnote text-label-secondary">
          <Link href={`/@${author.handle}`} className="font-semibold text-label underline-offset-2 hover:underline">
            @{author.handle}
          </Link>{" "}
          · <time dateTime={comment.created_at}>{timeAgo(comment.created_at)}</time>
        </p>
        <p className="text-body break-words whitespace-pre-line text-label">{comment.body}</p>
      </div>
      {canDelete && <DeleteCommentButton commentId={comment.id} mine={mine} onDeleted={onDeleted} />}
    </li>
  );
}
