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
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
