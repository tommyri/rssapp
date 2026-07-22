"use client";

import { useActionState } from "react";
import {
  type AccountActionState,
  revokeNativeSessionAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
} from "@/app/settings/actions";
import { Button } from "@/components/ui/button";

const initial: AccountActionState = { ok: true, message: "" };

function Message({ state }: { state: AccountActionState }) {
  if (!state.message) return null;
  return (
    <p
      aria-live="polite"
      className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
    >
      {state.message}
    </p>
  );
}

export function AccountSessionControls({
  sessions,
  nativeSessions,
  canManage,
}: {
  sessions: Array<{ id: string; signedInAt: string; isCurrent: boolean }>;
  nativeSessions: Array<{
    id: string;
    name: string;
    signedInAt: string;
    lastUsedAt: string | null;
  }>;
  canManage: boolean;
}) {
  const [sessionState, revokeSession, revokingSession] = useActionState(
    revokeSessionAction,
    initial,
  );
  const [othersState, revokeOthers, revokingOthers] = useActionState(
    revokeOtherSessionsAction,
    initial,
  );
  const [nativeState, revokeNative, revokingNative] = useActionState(
    revokeNativeSessionAction,
    initial,
  );
  const otherSessions = sessions.filter((session) => !session.isCurrent);
  const hasOtherSessions =
    otherSessions.length > 0 || nativeSessions.length > 0;

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h3 className="font-medium">Signed-in sessions</h3>
        <p className="text-xs text-muted-foreground">
          Review where your reader is signed in. Signing out another session
          keeps this one open.
        </p>
      </div>

      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          Sign out and back in on this device to manage your signed-in sessions.
        </p>
      ) : (
        <>
          <ul className="divide-y rounded-md border">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {session.isCurrent ? "This session" : "Another session"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Signed in {session.signedInAt}
                  </p>
                </div>
                {session.isCurrent ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Current
                  </span>
                ) : (
                  <form action={revokeSession}>
                    <input type="hidden" name="sessionId" value={session.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={revokingSession}
                    >
                      {revokingSession ? "Signing out…" : "Sign out"}
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>

          {nativeSessions.length ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Currentfold apps
              </p>
              <ul className="divide-y rounded-md border">
                {nativeSessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {session.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {session.lastUsedAt
                          ? `Last used ${session.lastUsedAt}`
                          : `Signed in ${session.signedInAt}`}
                      </p>
                    </div>
                    <form action={revokeNative}>
                      <input
                        type="hidden"
                        name="sessionId"
                        value={session.id}
                      />
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        disabled={revokingNative}
                      >
                        {revokingNative ? "Signing out…" : "Sign out"}
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
              <Message state={nativeState} />
            </div>
          ) : null}

          {hasOtherSessions ? (
            <form
              action={revokeOthers}
              className="flex flex-wrap items-center gap-3"
            >
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={revokingOthers}
              >
                {revokingOthers
                  ? "Signing out…"
                  : "Sign out all other sessions"}
              </Button>
              <Message state={othersState} />
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              No other signed-in sessions.
            </p>
          )}
          <Message state={sessionState} />
        </>
      )}
    </section>
  );
}
