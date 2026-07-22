"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { READER_SHORTCUTS } from "@/lib/keyboard";

export function KeyboardHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            The Google Reader canon — works anywhere except while typing in a
            field.
          </DialogDescription>
        </DialogHeader>
        <dl className="max-h-[min(60vh,24rem)] space-y-2 overflow-y-auto text-sm">
          {READER_SHORTCUTS.map(({ keys, action }) => (
            <div
              key={keys}
              className="flex items-baseline justify-between gap-4 border-b border-border/50 pb-2 last:border-0"
            >
              <dt>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {keys}
                </kbd>
              </dt>
              <dd className="text-right text-muted-foreground">{action}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
