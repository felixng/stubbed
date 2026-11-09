"use client";

import { useActionState } from "react";

import { resyncMember, testKey, type SupportState } from "@/app/app/backstage/membership/actions";
import { Button } from "@/components/ui/Button";

export function ResyncButton({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(resyncMember, {} as SupportState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="user_id" value={userId} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "Re-syncing…" : "Re-sync from RevenueCat"}
      </Button>
      {state.message && <p role="status" className="text-footnote text-label-secondary">{state.message}</p>}
    </form>
  );
}

export function TestKeyButton() {
  const [state, action, pending] = useActionState(testKey, {} as SupportState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "Testing…" : "Test the RevenueCat key"}
      </Button>
      {state.message && <p role="status" className="text-footnote text-label-secondary">{state.message}</p>}
    </form>
  );
}
