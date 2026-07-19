import type { BuildIdentity } from "@/lib/build-identity";

/** Quiet support metadata: useful when needed, absent from reading chrome. */
export function AppInformation({ identity }: { identity: BuildIdentity }) {
  return (
    <footer className="mt-10 border-t border-border/70 pt-4 text-xs text-muted-foreground">
      <p className="font-medium tracking-[0.08em] uppercase">App information</p>
      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        <div className="flex gap-1.5">
          <dt>Version</dt>
          <dd className="font-mono text-foreground">{identity.version}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Revision</dt>
          <dd className="font-mono text-foreground">
            {identity.shortRevision ?? "Local development"}
          </dd>
        </div>
      </dl>
      <p className="mt-1.5">
        Include these values when reporting a problem with this installation.
      </p>
    </footer>
  );
}
