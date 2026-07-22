"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type ActionState, saveLinkAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: ActionState = { ok: true, message: "" };

/**
 * Paste-a-URL field for the Read later view. On a successful save it refreshes
 * so the server re-renders the list (its key includes the saved count, so the
 * new page appears without a manual reload). The input is controlled so a
 * failed save keeps what the user typed.
 */
export function SaveLinkForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ActionState>(initial);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!url.trim()) return;
    const formData = new FormData();
    formData.set("url", url);
    startTransition(async () => {
      const result = await saveLinkAction(initial, formData);
      setState(result);
      if (result.ok) {
        setUrl("");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-1.5">
      <div className="flex gap-2">
        <Input
          name="url"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (state.message) setState(initial);
          }}
          placeholder="Paste a link to read later…"
          aria-label="Link to read later"
          className="h-8 text-sm"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          <PlusIcon className="size-3.5" />
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {state.message ? (
        <p
          className={`text-xs ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
