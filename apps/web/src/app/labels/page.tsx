import { BackLink } from "@/components/back-link";
import { LabelManager } from "@/components/label-manager";
import { getCurrentUserId } from "@/lib/current-user";
import { listLabelSummaries } from "@/lib/labels";

export default async function LabelsPage() {
  const userId = await getCurrentUserId();
  const labels = await listLabelSummaries(userId);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight">
            Labels
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize feed articles and saved links into your own views.
          </p>
        </div>
        <BackLink />
      </div>
      <LabelManager labels={labels} />
    </main>
  );
}
