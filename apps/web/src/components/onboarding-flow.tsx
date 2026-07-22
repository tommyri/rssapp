"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { type ActionState, addFeedAction } from "@/app/actions";
import {
  completeOnboardingAction,
  type OnboardingActionState,
} from "@/app/onboarding/actions";
import { AddFeedForm } from "@/components/add-feed-form";
import { OpmlControls } from "@/components/opml-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StarterFeed } from "@/lib/starter-feeds";

const onboardingInitial: OnboardingActionState = { ok: true, message: "" };
const feedInitial: ActionState = { ok: true, message: "" };

function CompleteButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Opening reader…" : label}
    </Button>
  );
}

function FinishSetupForm({
  displayName,
  formAction,
  label,
}: {
  displayName: string;
  formAction: (formData: FormData) => void;
  label: string;
}) {
  return (
    <form action={formAction}>
      <input type="hidden" name="displayName" value={displayName} />
      <CompleteButton label={label} />
    </form>
  );
}

function AddStarterButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Adding…" : "Add"}
    </Button>
  );
}

function StarterFeedCard({ feed }: { feed: StarterFeed }) {
  const [state, formAction] = useActionState(addFeedAction, feedInitial);
  return (
    <form
      action={formAction}
      className="flex items-center gap-3 rounded-lg border border-border/70 p-3"
    >
      <input type="hidden" name="url" value={feed.url} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{feed.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {state.message || feed.description}
        </p>
      </div>
      <AddStarterButton />
    </form>
  );
}

export function OnboardingFlow({
  email,
  displayName,
  starterFeeds,
}: {
  email: string;
  displayName: string | null;
  starterFeeds: StarterFeed[];
}) {
  const [state, formAction] = useActionState(
    completeOnboardingAction,
    onboardingInitial,
  );
  const [name, setName] = useState(displayName ?? "");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-10 md:py-16">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Welcome to rssapp</p>
        <h1 className="font-serif text-4xl font-bold tracking-tight">
          Set up your reader.
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Add a few sources now, or start with a clean slate. You can always
          change your subscriptions later.
        </p>
      </header>

      <section className="space-y-4 rounded-xl border p-5">
        <div className="space-y-1">
          <p className="text-sm font-medium">1. Bring your sources</p>
          <p className="text-xs text-muted-foreground">
            Moving from another reader? Import its OPML file and we’ll keep any
            folders it includes.
          </p>
        </div>
        <OpmlControls showExport={false} />
        <div className="border-t pt-4">
          <p className="mb-2 text-sm font-medium">Add one feed</p>
          <AddFeedForm />
        </div>
      </section>

      <section id="finish-setup" className="space-y-4 rounded-xl border p-5">
        <div className="space-y-1">
          <p className="text-sm font-medium">2. Set an optional name</p>
          <p className="text-xs text-muted-foreground">
            This stays private to your account and can be changed later in
            Settings.
          </p>
        </div>
        <div className="max-w-sm space-y-2">
          <Label htmlFor="onboarding-name">Name</Label>
          <Input
            id="onboarding-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            maxLength={80}
            placeholder="Optional"
          />
          <p className="text-xs text-muted-foreground">
            Signed in as {email}. A name is optional and stays private to your
            account.
          </p>
        </div>
        {state.message ? (
          <p
            className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
          >
            {state.message}
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Or try a few good ones</p>
          <p className="text-xs text-muted-foreground">
            Pick any that sound useful. They’re just suggestions, not a default
            bundle.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {starterFeeds.map((feed) => (
            <StarterFeedCard key={feed.url} feed={feed} />
          ))}
        </div>
        <div className="pt-1">
          <p className="mb-2 text-xs text-muted-foreground">
            Finished choosing? Your reader is ready.
          </p>
          <FinishSetupForm
            displayName={name}
            formAction={formAction}
            label="Start reading"
          />
        </div>
      </section>
    </div>
  );
}
