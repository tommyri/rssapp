"use client";

import { useTransition } from "react";
import { signOutAction } from "@/app/actions";
import { clearOfflineDeviceData } from "@/lib/offline-library";

/** Clears this browser's private offline data before ending the session. */
export function SignOutButton({
  userId,
  className,
}: {
  userId: number;
  className: string;
}) {
  const [pending, startSignOut] = useTransition();

  function signOut() {
    startSignOut(async () => {
      try {
        await clearOfflineDeviceData(userId);
      } finally {
        await signOutAction();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className={`${className} disabled:opacity-50`}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
