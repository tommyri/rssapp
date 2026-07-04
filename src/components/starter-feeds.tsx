"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { type ActionState, addFeedAction } from "@/app/actions";
import { OpmlControls } from "@/components/opml-controls";
import { Button } from "@/components/ui/button";
import type { StarterFeed } from "@/lib/starter-feeds";

const initial: ActionState = { ok: true, message: "" };

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Adding…" : "Add"}
    </Button>
  );
}

function StarterCard({ feed }: { feed: StarterFeed }) {
  const [state, formAction] = useActionState(addFeedAction, initial);
  return (
    <form
      action={formAction}
      className="flex items-center gap-3 rounded-lg border p-3"
    >
      <input type="hidden" name="url" value={feed.url} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{feed.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {state.message || feed.description}
        </div>
      </div>
      <AddButton />
    </form>
  );
}

export function StarterFeeds({ feeds }: { feeds: StarterFeed[] }) {
  return (
    <div className="space-y-3">
      <h2 className="font-serif text-3xl font-bold tracking-tight">
        Welcome<span className="text-primary">.</span>
      </h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        Import an OPML file from your old reader, paste any feed or site URL in
        the sidebar — or start with a few good ones:
      </p>
      <OpmlControls />
      <div className="grid gap-2 sm:grid-cols-2">
        {feeds.map((feed) => (
          <StarterCard key={feed.url} feed={feed} />
        ))}
      </div>
    </div>
  );
}
