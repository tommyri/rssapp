"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { KeyboardHelpDialog } from "@/components/keyboard-help-dialog";
import { shouldIgnoreKeyboard } from "@/lib/keyboard";

const GO_TIMEOUT_MS = 1500;

/**
 * Reader-wide shortcuts that aren't tied to a particular article: search focus,
 * add-feed focus, g-then navigation, and the ? help overlay (design-ux.md).
 */
export function ReaderGlobalKeyboard() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const goPending = useRef(false);
  const goTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearGo() {
      goPending.current = false;
      if (goTimer.current) {
        clearTimeout(goTimer.current);
        goTimer.current = null;
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (shouldIgnoreKeyboard(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (goPending.current) {
        const key = e.key.toLowerCase();
        if (key === "a" || key === "s" || key === "u") {
          e.preventDefault();
          clearGo();
          if (key === "a") router.push("/");
          else if (key === "s") router.push("/?view=starred");
          else router.push("/");
        } else {
          clearGo();
        }
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("reader-search")?.focus();
        return;
      }

      if (e.key === "a") {
        e.preventDefault();
        document.getElementById("reader-add-feed")?.focus();
        return;
      }

      if (e.key === "g") {
        e.preventDefault();
        goPending.current = true;
        goTimer.current = setTimeout(clearGo, GO_TIMEOUT_MS);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearGo();
    };
  }, [router]);

  return <KeyboardHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />;
}
