"use client";

import { useActionState, useState } from "react";
import {
  type ApiAccessTokenActionState,
  createApiAccessTokenAction,
  revokeApiAccessTokenAction,
} from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: ApiAccessTokenActionState = { ok: true, message: "" };

function Message({ state }: { state: ApiAccessTokenActionState }) {
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

function formatDate(value: string | null): string {
  if (!value) return "Not used yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ApiAccessTokenControls({
  endpoint,
  tokens,
}: {
  endpoint: string;
  tokens: Array<{
    id: number;
    name: string;
    tokenPrefix: string;
    createdAt: string;
    lastUsedAt: string | null;
  }>;
}) {
  const [createState, createToken, creating] = useActionState(
    createApiAccessTokenAction,
    initial,
  );
  const [revokeState, revokeToken, revoking] = useActionState(
    revokeApiAccessTokenAction,
    initial,
  );
  const [copied, setCopied] = useState(false);

  async function copySecret() {
    if (!createState.secret) return;
    try {
      await navigator.clipboard.writeText(createState.secret);
      setCopied(true);
    } catch {
      // Local HTTP and some privacy modes deny clipboard access. The visible
      // credential remains available for a deliberate manual copy.
      setCopied(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h3 className="font-medium">Native reader apps</h3>
        <p className="text-xs text-muted-foreground">
          Connect a Google Reader-compatible app with a separate app password.
          It can read and update your reader, but cannot sign in to this site or
          change your account.
        </p>
      </div>

      <div className="rounded-md bg-muted/50 p-3 text-sm">
        <p className="font-medium">Server address</p>
        <code className="mt-1 block break-all text-xs text-muted-foreground">
          {endpoint}
        </code>
      </div>

      <form action={createToken} className="flex flex-wrap gap-2">
        <Input
          name="name"
          defaultValue="Native reader app"
          maxLength={80}
          className="h-9 min-w-48 flex-1"
          aria-label="App password name"
          required
        />
        <Button type="submit" size="sm" disabled={creating}>
          {creating ? "Creating…" : "Create app password"}
        </Button>
      </form>
      <Message state={createState} />

      {createState.secret ? (
        <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-medium">Copy this app password now</p>
          <code className="block break-all rounded bg-background px-2 py-1.5 text-xs">
            {createState.secret}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copySecret}
          >
            {copied ? "Copied" : "Copy app password"}
          </Button>
        </div>
      ) : null}

      {tokens.length ? (
        <ul className="divide-y rounded-md border">
          {tokens.map((token) => (
            <li
              key={token.id}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{token.name}</p>
                <p className="text-xs text-muted-foreground">
                  {token.tokenPrefix} · Last used {formatDate(token.lastUsedAt)}
                </p>
              </div>
              <form action={revokeToken}>
                <input type="hidden" name="tokenId" value={token.id} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={revoking}
                >
                  {revoking ? "Revoking…" : "Revoke"}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No native reader apps connected yet.
        </p>
      )}
      <Message state={revokeState} />
    </section>
  );
}
