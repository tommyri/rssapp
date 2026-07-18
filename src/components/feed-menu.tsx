"use client";

import { EllipsisIcon } from "lucide-react";
import { useState } from "react";
import { unsubscribeAction, updateFeedAction } from "@/app/feeds/actions";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FeedSummary } from "@/lib/reader";

/**
 * Per-feed kebab menu in the sidebar: edit title/folder/settings in a dialog,
 * or unsubscribe — no trip to the manage page for one feed.
 */
export function FeedMenu({
  feed,
  folderNames,
}: {
  feed: FeedSummary;
  folderNames: string[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [unsubscribeOpen, setUnsubscribeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);
  const label = feed.title ?? feed.url;

  async function submitEdit(formData: FormData) {
    setSaving(true);
    try {
      await updateFeedAction(formData);
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function unsubscribe() {
    setUnsubscribing(true);
    const formData = new FormData();
    formData.set("feedId", String(feed.feedId));
    try {
      await unsubscribeAction(formData);
      setUnsubscribeOpen(false);
    } finally {
      setUnsubscribing(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Feed options for ${feed.title ?? feed.url}`}
            className="rounded p-0.5 text-muted-foreground opacity-100 transition-opacity outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
            onClick={(e) => e.preventDefault()}
          >
            <EllipsisIcon className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            Edit feed…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setUnsubscribeOpen(true)}
          >
            Unsubscribe
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <form action={submitEdit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="font-serif">
                {feed.feedTitle ?? feed.url}
              </DialogTitle>
              <DialogDescription className="truncate text-xs">
                {feed.url}
              </DialogDescription>
            </DialogHeader>

            <input type="hidden" name="feedId" value={feed.feedId} />

            <div className="space-y-2">
              <Label htmlFor={`menu-title-${feed.feedId}`}>Custom title</Label>
              <Input
                id={`menu-title-${feed.feedId}`}
                name="title"
                defaultValue={feed.customTitle ?? ""}
                placeholder={feed.feedTitle ?? "Feed title"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`menu-folder-${feed.feedId}`}>Folder</Label>
              <Input
                id={`menu-folder-${feed.feedId}`}
                name="folder"
                list={`menu-folders-${feed.feedId}`}
                defaultValue={feed.folderName ?? ""}
                placeholder="None"
              />
              <datalist id={`menu-folders-${feed.feedId}`}>
                {folderNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`menu-autoread-${feed.feedId}`}>
                Auto-mark read after (days)
              </Label>
              <Input
                id={`menu-autoread-${feed.feedId}`}
                name="autoReadDays"
                type="number"
                min={1}
                max={365}
                defaultValue={feed.autoReadDays ?? ""}
                placeholder="use default"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`menu-sort-${feed.feedId}`}>Sort order</Label>
              <select
                id={`menu-sort-${feed.feedId}`}
                name="sortOrder"
                defaultValue={feed.sortOrder}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="defaultUnreadOnly"
                defaultChecked={feed.defaultUnreadOnly}
                className="accent-primary"
              />
              Unread only by default
            </label>

            <DialogFooter>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={unsubscribeOpen} onOpenChange={setUnsubscribeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Unsubscribe from this feed?</DialogTitle>
            <DialogDescription>
              Unsubscribe from “{label}”? Its stored articles will be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={unsubscribing}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={unsubscribing}
              onClick={unsubscribe}
            >
              {unsubscribing ? "Unsubscribing…" : "Unsubscribe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
