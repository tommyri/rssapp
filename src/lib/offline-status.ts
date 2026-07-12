export type OfflineStatusTone = "success" | "error";

export function offlineStatusClassName(tone: OfflineStatusTone): string {
  return tone === "error" ? "text-destructive" : "text-muted-foreground";
}
