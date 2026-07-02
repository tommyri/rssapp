"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { type ActionState, importOpmlAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

const initial: ActionState = { ok: true, message: "" };

function ImportButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Importing…" : "Import OPML"}
    </Button>
  );
}

export function OpmlControls() {
  const [state, formAction] = useActionState(importOpmlAction, initial);
  return (
    <div className="space-y-2">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="file"
          accept=".opml,.xml,text/xml,text/x-opml,application/xml"
          aria-label="OPML file"
          className="max-w-[11rem] text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-input file:bg-transparent file:px-2 file:py-1 file:text-xs"
        />
        <ImportButton />
        <Button asChild variant="ghost" size="sm">
          <a href="/api/opml/export" download>
            Export
          </a>
        </Button>
      </form>
      {state.message ? (
        <p
          className={`text-xs ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
