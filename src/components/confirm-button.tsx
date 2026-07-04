"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * A submit button that asks for confirmation before letting the form submit.
 * Used for destructive actions like unsubscribing.
 */
export function ConfirmButton({
  message,
  children,
}: {
  message: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="submit"
      variant="outline"
      size="sm"
      className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
