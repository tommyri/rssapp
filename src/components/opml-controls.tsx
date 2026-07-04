"use client";

import { DownloadIcon, UploadIcon } from "lucide-react";
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

  const buttonClass =
    "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <form ref={formRef} action={formAction} className="contents">
          <label className={buttonClass}>
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
            <UploadIcon className="size-3.5" />
            <ImportLabel fileName={fileName} />
          </label>
        </form>
        <a href="/api/opml/export" download className={buttonClass}>
          <DownloadIcon className="size-3.5" />
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
