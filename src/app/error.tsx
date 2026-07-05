"use client"; // Error boundaries must be Client Components

import { RotateCwIcon } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Root error boundary (error.tsx convention): catches uncaught render errors
 * from any page and shows a recoverable fallback instead of the framework
 * crash screen. Renders inside the root layout, so fonts and theme still apply.
 */
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Single-user self-hosted app: the server log is the error report.
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <h2 className="font-serif text-2xl font-bold tracking-tight">
        Something went wrong
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        An unexpected error kept this page from rendering. Try again — if it
        keeps happening, the server log has the details.
        {error.digest ? (
          <span className="mt-1 block text-xs">
            Error digest: {error.digest}
          </span>
        ) : null}
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={
          // Re-fetch and re-render the failed segment.
          () => unstable_retry()
        }
      >
        <RotateCwIcon className="size-3.5" />
        Try again
      </Button>
    </div>
  );
}
