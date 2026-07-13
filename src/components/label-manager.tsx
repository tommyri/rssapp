"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createLabelAction,
  deleteLabelAction,
  renameLabelAction,
} from "@/app/labels/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LabelSummary } from "@/lib/labels";

export function LabelManager({ labels }: { labels: LabelSummary[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createLabelAction(newName);
      setMessage(result.message);
      if (result.ok) {
        setNewName("");
        router.refresh();
      }
    });
  }

  function rename(labelId: number, name: string) {
    startTransition(async () => {
      const result = await renameLabelAction(labelId, name);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  function remove(label: LabelSummary) {
    if (
      !window.confirm(
        `Delete “${label.name}”? It will be removed from ${label.count} saved entr${label.count === 1 ? "y" : "ies"}${label.ruleCount === 0 ? "" : ` and delete ${label.ruleCount} label rule${label.ruleCount === 1 ? "" : "s"}`}.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      await deleteLabelAction(label.id);
      setMessage(`Deleted “${label.name}”.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="flex gap-2">
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New label"
          aria-label="New label"
          maxLength={40}
          disabled={pending}
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add label"}
        </Button>
      </form>

      {message ? (
        <output className="block text-sm text-muted-foreground">
          {message}
        </output>
      ) : null}

      {labels.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No labels yet. Create one to organize articles and saved links.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {labels.map((label) => (
            <li
              key={label.id}
              className="flex flex-wrap items-center gap-2 p-3"
            >
              <form
                className="flex min-w-48 flex-1 gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = new FormData(event.currentTarget).get("name");
                  rename(label.id, String(name ?? ""));
                }}
              >
                <Input
                  name="name"
                  defaultValue={label.name}
                  aria-label={`Rename ${label.name}`}
                  maxLength={40}
                  disabled={pending}
                />
                <Button type="submit" variant="outline" disabled={pending}>
                  Rename
                </Button>
              </form>
              <span className="text-xs text-muted-foreground">
                {label.count} entr{label.count === 1 ? "y" : "ies"}
                {label.ruleCount > 0
                  ? ` · ${label.ruleCount} rule${label.ruleCount === 1 ? "" : "s"}`
                  : ""}
              </span>
              <Button
                type="button"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={pending}
                onClick={() => remove(label)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
