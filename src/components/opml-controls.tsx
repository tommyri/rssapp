"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { type ActionState, importOpmlAction } from "@/app/actions";

const initial: ActionState = { ok: true, message: "" };

function ImportLabel({ fileName }: { fileName: string | null }) {
  const { pending } = useFormStatus();
  if (pending) return <span>Importing…</span>;
  return <span>{fileName ? `Import ${fileName}` : "Import OPML…"}</span>;
}

export function OpmlControls() {
  const [state, formAction] = useActionState(importOpmlAction, initial);
  const [fileName, setFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <form ref={formRef} action={formAction} className="contents">
          <label className="cursor-pointer underline underline-offset-2 transition-colors hover:text-foreground">
            <input
              type="file"
              name="file"
              accept=".opml,.xml,text/xml,text/x-opml,application/xml"
              aria-label="OPML file"
              className="sr-only"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                setFileName(file?.name ?? null);
                // Importing on selection: picking a file is the intent.
                if (file) formRef.current?.requestSubmit();
              }}
            />
            <ImportLabel fileName={fileName} />
          </label>
        </form>
        <a
          href="/api/opml/export"
          download
          className="underline underline-offset-2 transition-colors hover:text-foreground"
        >
          Export OPML
        </a>
      </div>
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
