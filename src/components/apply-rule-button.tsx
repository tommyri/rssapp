"use client";

import { useActionState, useRef, useState } from "react";
import {
  applyRuleToExistingAction,
  type RuleApplyState,
} from "@/app/rules/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const initialState: RuleApplyState = { ok: false, message: "" };

/** A confirmed, bounded batch apply for rules that have already been saved. */
export function ApplyRuleButton({
  ruleId,
  disabled,
}: {
  ruleId: number;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    applyRuleToExistingAction,
    initialState,
  );
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={formAction} className="contents" ref={formRef}>
      <input type="hidden" name="ruleId" value={ruleId} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || pending}
        title={disabled ? "Enable this rule before applying it." : undefined}
        onClick={() => setOpen(true)}
      >
        {pending ? "Applying…" : "Apply to existing"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Apply this rule to existing articles?</DialogTitle>
            <DialogDescription>
              This can change read, star, mute, or label state. It scans the
              newest 500 articles in this rule's scope and cannot undo changes
              already made.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                formRef.current?.requestSubmit();
              }}
            >
              Apply rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {state.message ? (
        <span
          aria-live="polite"
          className={`w-full text-xs ${
            state.ok ? "text-muted-foreground" : "text-destructive"
          }`}
        >
          {state.message}
          {state.ok && state.hasMore
            ? " More articles may remain beyond this 500-article batch."
            : ""}
        </span>
      ) : null}
    </form>
  );
}
