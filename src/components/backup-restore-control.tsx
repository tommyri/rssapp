"use client";

import { CheckIcon, LoaderCircleIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BACKUP_RESTORE_MAX_BYTES } from "@/lib/backup-restore-config";
import { clearOfflineDeviceData } from "@/lib/offline-library";

interface BackupRestorePreview {
  sourceEmail: string;
  exportedAt: string;
  folders: number;
  subscriptions: number;
  articles: number;
  savedPages: number;
  labels: number;
  rules: number;
  highlights: number;
}

interface CurrentReaderDataPreview {
  folders: number;
  subscriptions: number;
  articleStates: number;
  savedPages: number;
  labels: number;
  rules: number;
  highlights: number;
}

type RestoreResponse =
  | { preview: BackupRestorePreview; current: CurrentReaderDataPreview }
  | { restored: BackupRestorePreview }
  | { error: string };

function plural(value: number, noun: string): string {
  return `${value.toLocaleString()} ${noun}${value === 1 ? "" : "s"}`;
}

function hasCurrentReaderData(current: CurrentReaderDataPreview): boolean {
  return Object.values(current).some((value) => value > 0);
}

async function requestRestore(
  mode: "preview" | "restore",
  content: string,
): Promise<RestoreResponse> {
  const response = await fetch(`/api/backup/restore?mode=${mode}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: content,
    credentials: "same-origin",
  });
  const body = (await response
    .json()
    .catch(() => null)) as RestoreResponse | null;
  if (!response.ok || !body || "error" in body) {
    throw new Error(
      body && "error" in body ? body.error : "Something went wrong.",
    );
  }
  return body;
}

/** Upload, verify, and explicitly replace reader data from a portable backup. */
export function BackupRestoreControl({ userId }: { userId: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [backupContent, setBackupContent] = useState<string | null>(null);
  const [preview, setPreview] = useState<BackupRestorePreview | null>(null);
  const [current, setCurrent] = useState<CurrentReaderDataPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [replacementConfirmed, setReplacementConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function previewFile(file: File) {
    if (file.size > BACKUP_RESTORE_MAX_BYTES) {
      setError("Backups must be 50 MB or smaller.");
      return;
    }

    setChecking(true);
    setError(null);
    setSuccess(null);
    setPreview(null);
    setCurrent(null);
    setBackupContent(null);
    setFileName(file.name);
    try {
      const content = await file.text();
      const result = await requestRestore("preview", content);
      if (!("preview" in result))
        throw new Error("The backup could not be checked.");
      setBackupContent(content);
      setPreview(result.preview);
      setCurrent(result.current);
    } catch (caught) {
      setFileName(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "The backup could not be checked.",
      );
    } finally {
      setChecking(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirmRestore() {
    if (!backupContent || !preview || !current || !replacementConfirmed) return;

    setRestoring(true);
    setError(null);
    try {
      // Prevent stale offline copies or queued mutations from surviving a
      // deliberate replacement of this account's reader data.
      try {
        await clearOfflineDeviceData(userId);
      } catch {
        throw new Error(
          "Couldn’t clear offline data on this device. Your reader data was not replaced.",
        );
      }
      const result = await requestRestore("restore", backupContent);
      if (!("restored" in result))
        throw new Error("The backup could not be restored.");
      setConfirmOpen(false);
      setPreview(null);
      setCurrent(null);
      setBackupContent(null);
      setFileName(null);
      setSuccess(
        `Replaced reader data with ${plural(result.restored.subscriptions, "subscription")} and ${plural(result.restored.articles, "article")}.`,
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The backup could not be restored.",
      );
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Restore a backup</h4>
        <p className="text-xs text-muted-foreground">
          Restore replaces this account&apos;s reader data with the backup. It
          never merges records and leaves this account&apos;s login details
          alone.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void previewFile(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={checking || restoring}
        onClick={() => inputRef.current?.click()}
      >
        {checking ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : (
          <UploadIcon />
        )}
        {checking ? "Checking backup…" : "Choose JSON backup"}
      </Button>
      {fileName ? (
        <p className="text-xs text-muted-foreground">{fileName}</p>
      ) : null}
      {preview ? (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-xs">
          <div className="space-y-0.5">
            <p className="font-medium">Backup checked</p>
            <p className="text-muted-foreground">
              From {preview.sourceEmail}, exported{" "}
              {new Date(preview.exportedAt).toLocaleString()}.
            </p>
          </div>
          <p className="font-medium">Backup contents</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-3">
            <span>{plural(preview.folders, "folder")}</span>
            <span>{plural(preview.subscriptions, "subscription")}</span>
            <span>{plural(preview.articles, "article")}</span>
            <span>{plural(preview.savedPages, "saved page")}</span>
            <span>{plural(preview.labels, "label")}</span>
            <span>{plural(preview.rules, "rule")}</span>
            <span>{plural(preview.highlights, "highlight")}</span>
          </div>
          {current ? (
            <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
              <p className="font-medium text-foreground">
                {hasCurrentReaderData(current)
                  ? "Current reader data to be replaced"
                  : "No current reader data to replace"}
              </p>
              {hasCurrentReaderData(current) ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-3">
                  <span>{plural(current.folders, "folder")}</span>
                  <span>{plural(current.subscriptions, "subscription")}</span>
                  <span>{plural(current.articleStates, "article state")}</span>
                  <span>{plural(current.savedPages, "saved page")}</span>
                  <span>{plural(current.labels, "label")}</span>
                  <span>{plural(current.rules, "rule")}</span>
                  <span>{plural(current.highlights, "highlight")}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              setReplacementConfirmed(false);
              setConfirmOpen(true);
            }}
          >
            Review replacement
          </Button>
        </div>
      ) : null}
      {error ? (
        <p aria-live="polite" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          aria-live="polite"
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <CheckIcon className="size-3.5 text-primary" />
          {success}
        </p>
      ) : null}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!restoring) {
            setConfirmOpen(open);
            if (!open) setReplacementConfirmed(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Replace current reader data?</DialogTitle>
            <DialogDescription>
              This permanently removes this account&apos;s current reader data
              and replaces it with the checked backup. There is no merge. Your
              email and password stay unchanged. Offline copies on this device
              will also be cleared.
            </DialogDescription>
            {error ? (
              <p aria-live="polite" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </DialogHeader>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-destructive"
              checked={replacementConfirmed}
              disabled={restoring}
              onChange={(event) =>
                setReplacementConfirmed(event.target.checked)
              }
            />
            <span>
              I understand that my current reader data will be permanently
              replaced.
            </span>
          </label>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={restoring}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={restoring || !replacementConfirmed}
              onClick={() => void confirmRestore()}
            >
              {restoring ? <LoaderCircleIcon className="animate-spin" /> : null}
              {restoring ? "Replacing…" : "Replace reader data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
