"use client";

import { useEffect } from "react";
import { setOfflineOwner } from "@/lib/offline-library";

/** Registers the offline shell only for an authenticated reader session. */
export function PwaRegister({ userId }: { userId: number }) {
  useEffect(() => {
    setOfflineOwner(userId);
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register("/service-worker.js", {
        scope: "/",
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, [userId]);

  return null;
}
