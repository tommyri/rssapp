import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

/** The standard "back to reader" button used by every auxiliary page. */
export function BackLink({
  href = "/",
  label = "Back to reader",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground"
    >
      <ArrowLeftIcon className="size-3.5" />
      {label}
    </Link>
  );
}
