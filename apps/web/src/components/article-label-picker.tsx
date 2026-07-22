"use client";

import { TagIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  toggleItemLabelAction,
  toggleSavedPageLabelAction,
} from "@/app/labels/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ReaderLabel } from "@/lib/labels";
import type { ReaderItem } from "@/lib/reader";

interface ArticleLabelPickerProps {
  item: ReaderItem;
  labels: ReaderLabel[];
  onChange: (label: ReaderLabel, assigned: boolean) => void;
}

/** Compact per-entry assignment menu for the shared item/saved-page label model. */
export function ArticleLabelPicker({
  item,
  labels,
  onChange,
}: ArticleLabelPickerProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = new Set((item.labels ?? []).map((label) => label.id));

  function setAssignment(label: ReaderLabel, assigned: boolean) {
    startTransition(async () => {
      const applied =
        item.kind === "item"
          ? await toggleItemLabelAction(item.id, label.id, assigned)
          : await toggleSavedPageLabelAction(item.id, label.id, assigned);
      if (!applied) {
        setError("Could not update labels for this entry.");
        return;
      }
      setError("");
      onChange(label, assigned);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={pending}>
          <TagIcon className="size-3.5" />
          Labels
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Labels</DropdownMenuLabel>
        {labels.length === 0 ? (
          <DropdownMenuItem asChild>
            <Link href="/labels">Create a label first</Link>
          </DropdownMenuItem>
        ) : (
          labels.map((label) => (
            <DropdownMenuCheckboxItem
              key={label.id}
              checked={selected.has(label.id)}
              disabled={pending}
              onCheckedChange={(checked) =>
                setAssignment(label, checked === true)
              }
            >
              {label.name}
            </DropdownMenuCheckboxItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/labels">Manage labels</Link>
        </DropdownMenuItem>
        {error ? (
          <DropdownMenuLabel className="text-destructive">
            {error}
          </DropdownMenuLabel>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
