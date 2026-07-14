"use client";

import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PauseIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, useEffect, useState, useTransition } from "react";
import {
  reorderFeedsAction,
  reorderFoldersAction,
  setFolderCollapsedAction,
} from "@/app/sidebar-actions";
import { FeedIcon } from "@/components/feed-icon";
import { FeedMenu } from "@/components/feed-menu";
import type { FeedSummary } from "@/lib/reader";
import {
  orderBySavedIds,
  type SidebarPreferences,
  sidebarFeedOrderKey,
} from "@/lib/sidebar-preferences";

export interface SidebarFolderGroup {
  id: number;
  name: string;
  feeds: FeedSummary[];
}

type SidebarDragKind = "folder" | "feed";

interface SidebarDragData {
  sidebarKind: SidebarDragKind;
  entityId: number;
  folderId: number | null;
  label: string;
}

function sortableId(kind: SidebarDragKind, entityId: number): string {
  return `${kind}:${entityId}`;
}

function dragData(value: unknown): SidebarDragData | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Partial<SidebarDragData>;
  if (
    (data.sidebarKind !== "folder" && data.sidebarKind !== "feed") ||
    !Number.isInteger(data.entityId) ||
    (data.folderId !== null && !Number.isInteger(data.folderId)) ||
    typeof data.label !== "string"
  ) {
    return null;
  }
  return data as SidebarDragData;
}

/** Only collide with entries in the active item's current sortable list. */
const sameListCollision: CollisionDetection = (args) => {
  const active = dragData(args.active.data.current);
  if (!active) return closestCenter(args);

  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((container) => {
      const candidate = dragData(container.data.current);
      return (
        candidate?.sidebarKind === active.sidebarKind &&
        candidate.folderId === active.folderId
      );
    }),
  });
};

function organizeSidebar(
  folderGroups: SidebarFolderGroup[],
  ungrouped: FeedSummary[],
  preferences: SidebarPreferences,
) {
  const orderedFolders = orderBySavedIds(
    folderGroups,
    preferences.folderIds,
    (group) => group.id,
  ).map((group) => ({
    ...group,
    feeds: orderBySavedIds(
      group.feeds,
      preferences.feedIdsByFolder[sidebarFeedOrderKey(group.id)] ?? [],
      (feed) => feed.feedId,
    ),
  }));

  return {
    folderGroups: orderedFolders,
    ungrouped: orderBySavedIds(
      ungrouped,
      preferences.feedIdsByFolder[sidebarFeedOrderKey(null)] ?? [],
      (feed) => feed.feedId,
    ),
  };
}

function DragPreview({ drag }: { drag: SidebarDragData }) {
  return (
    <div className="w-64 rounded-md border bg-popover px-3 py-2 text-sm font-medium text-popover-foreground shadow-xl">
      {drag.label}
    </div>
  );
}

function SortableFeedRow({
  feed,
  folderId,
  folderNames,
  active,
  pending,
}: {
  feed: FeedSummary;
  folderId: number | null;
  folderNames: string[];
  active: boolean;
  pending: boolean;
}) {
  const label = feed.title ?? feed.url;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId("feed", feed.feedId),
    data: {
      sidebarKind: "feed",
      entityId: feed.feedId,
      folderId,
      label,
    } satisfies SidebarDragData,
    attributes: { role: "listitem", roleDescription: "sortable feed" },
    disabled: pending,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group ml-3 touch-manipulation select-none ${
        isDragging ? "opacity-35" : ""
      }`}
    >
      <div
        className={`flex min-w-0 cursor-grab items-center rounded-md transition-colors active:cursor-grabbing ${
          active
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/60"
        }`}
      >
        <Link
          href={`/?feed=${feed.feedId}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-sm"
        >
          <FeedIcon siteUrl={feed.siteUrl} feedUrl={feed.url} />
          {feed.lastError ? (
            <span title={feed.lastError} className="shrink-0 text-destructive">
              <TriangleAlertIcon className="size-3.5" />
            </span>
          ) : null}
          {feed.paused ? (
            <span
              title="Fetching paused — resume on the Manage feeds page"
              className="shrink-0 text-muted-foreground"
            >
              <PauseIcon className="size-3.5" />
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {feed.unread > 0 ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {feed.unread > 1000 ? "1k+" : feed.unread}
            </span>
          ) : null}
        </Link>
        <span className="flex shrink-0 items-center pr-1">
          <FeedMenu feed={feed} folderNames={folderNames} />
        </span>
      </div>
    </li>
  );
}

function SortableFolderGroup({
  group,
  folderNames,
  activeFeedId,
  activeFolderId,
  collapsed,
  pending,
  onToggle,
}: {
  group: SidebarFolderGroup;
  folderNames: string[];
  activeFeedId?: number;
  activeFolderId?: number;
  collapsed: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId("folder", group.id),
    data: {
      sidebarKind: "folder",
      entityId: group.id,
      folderId: null,
      label: group.name,
    } satisfies SidebarDragData,
    attributes: { role: "listitem", roleDescription: "sortable folder" },
    disabled: pending,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`touch-manipulation select-none pt-3 ${
        isDragging ? "opacity-35" : ""
      }`}
    >
      <div
        className={`flex min-w-0 cursor-grab items-center rounded-md transition-colors active:cursor-grabbing ${
          activeFolderId === group.id
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/60"
        }`}
      >
        <button
          type="button"
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.name}`}
          aria-expanded={!collapsed}
          disabled={pending}
          onClick={onToggle}
          className="ml-1 rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {collapsed ? (
            <ChevronRightIcon className="size-3.5" />
          ) : (
            <ChevronDownIcon className="size-3.5" />
          )}
        </button>
        <Link
          href={`/?folder=${group.id}`}
          className={`min-w-0 flex-1 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase ${
            activeFolderId === group.id
              ? "text-primary"
              : "text-muted-foreground group-hover:text-foreground"
          }`}
        >
          <span className="block truncate">{group.name}</span>
        </Link>
      </div>

      {!collapsed ? (
        <SortableContext
          items={group.feeds.map((feed) => sortableId("feed", feed.feedId))}
          strategy={verticalListSortingStrategy}
        >
          <ul className="m-0 list-none p-0">
            {group.feeds.map((feed) => (
              <SortableFeedRow
                key={feed.feedId}
                feed={feed}
                folderId={group.id}
                folderNames={folderNames}
                active={activeFeedId === feed.feedId}
                pending={pending}
              />
            ))}
          </ul>
        </SortableContext>
      ) : null}
    </li>
  );
}

/** Interactive, persisted organization for the server-rendered sidebar lists. */
export function SidebarOrganizer({
  folderGroups: initialFolderGroups,
  ungrouped: initialUngrouped,
  folderNames,
  activeFeedId,
  activeFolderId,
  sidebarPreferences,
}: {
  folderGroups: SidebarFolderGroup[];
  ungrouped: FeedSummary[];
  folderNames: string[];
  activeFeedId?: number;
  activeFolderId?: number;
  sidebarPreferences: SidebarPreferences;
}) {
  const router = useRouter();
  const [folderGroups, setFolderGroups] = useState(
    () =>
      organizeSidebar(initialFolderGroups, initialUngrouped, sidebarPreferences)
        .folderGroups,
  );
  const [ungrouped, setUngrouped] = useState(
    () =>
      organizeSidebar(initialFolderGroups, initialUngrouped, sidebarPreferences)
        .ungrouped,
  );
  const [collapsed, setCollapsed] = useState(
    () => new Set(sidebarPreferences.collapsedFolderIds),
  );
  const [activeDrag, setActiveDrag] = useState<SidebarDragData | null>(null);
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    const organized = organizeSidebar(
      initialFolderGroups,
      initialUngrouped,
      sidebarPreferences,
    );
    setFolderGroups(organized.folderGroups);
    setUngrouped(organized.ungrouped);
    setCollapsed(new Set(sidebarPreferences.collapsedFolderIds));
  }, [initialFolderGroups, initialUngrouped, sidebarPreferences]);

  function persist(work: () => Promise<boolean>) {
    startTransition(async () => {
      if (!(await work())) router.refresh();
    });
  }

  function persistFolderOrder(nextGroups: SidebarFolderGroup[]) {
    setFolderGroups(nextGroups);
    persist(() => reorderFoldersAction(nextGroups.map((group) => group.id)));
  }

  function setFeedOrder(folderId: number | null, feeds: FeedSummary[]) {
    if (folderId === null) {
      setUngrouped(feeds);
    } else {
      setFolderGroups((groups) =>
        groups.map((group) =>
          group.id === folderId ? { ...group, feeds } : group,
        ),
      );
    }
    persist(() =>
      reorderFeedsAction(
        folderId,
        feeds.map((feed) => feed.feedId),
      ),
    );
  }

  function feedsIn(folderId: number | null): FeedSummary[] {
    return folderId === null
      ? ungrouped
      : (folderGroups.find((group) => group.id === folderId)?.feeds ?? []);
  }

  function toggleFolder(folderId: number) {
    const next = new Set(collapsed);
    const shouldCollapse = !next.has(folderId);
    if (shouldCollapse) next.add(folderId);
    else next.delete(folderId);
    setCollapsed(next);
    persist(() => setFolderCollapsedAction(folderId, shouldCollapse));
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDrag(dragData(event.active.data.current));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDrag(null);
    if (!over || active.id === over.id) return;

    const source = dragData(active.data.current);
    const target = dragData(over.data.current);
    if (
      !source ||
      !target ||
      source.sidebarKind !== target.sidebarKind ||
      source.folderId !== target.folderId
    ) {
      return;
    }

    if (source.sidebarKind === "folder") {
      const from = folderGroups.findIndex(
        (group) => group.id === source.entityId,
      );
      const to = folderGroups.findIndex(
        (group) => group.id === target.entityId,
      );
      if (from >= 0 && to >= 0)
        persistFolderOrder(arrayMove(folderGroups, from, to));
      return;
    }

    const feeds = feedsIn(source.folderId);
    const from = feeds.findIndex((feed) => feed.feedId === source.entityId);
    const to = feeds.findIndex((feed) => feed.feedId === target.entityId);
    if (from >= 0 && to >= 0) {
      setFeedOrder(source.folderId, arrayMove(feeds, from, to));
    }
  }

  return (
    <DndContext
      id="sidebar-organizer"
      sensors={sensors}
      collisionDetection={sameListCollision}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveDrag(null)}
      onDragEnd={handleDragEnd}
    >
      <div aria-busy={pending}>
        <SortableContext
          items={folderGroups.map((group) => sortableId("folder", group.id))}
          strategy={verticalListSortingStrategy}
        >
          <ul className="m-0 list-none p-0">
            {folderGroups.map((group) => (
              <SortableFolderGroup
                key={group.id}
                group={group}
                folderNames={folderNames}
                activeFeedId={activeFeedId}
                activeFolderId={activeFolderId}
                collapsed={collapsed.has(group.id)}
                pending={pending}
                onToggle={() => toggleFolder(group.id)}
              />
            ))}
          </ul>
        </SortableContext>

        {ungrouped.length > 0 ? (
          <section className="pt-3">
            {folderGroups.length > 0 ? (
              <div className="px-2 py-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Feeds
              </div>
            ) : null}
            <SortableContext
              items={ungrouped.map((feed) => sortableId("feed", feed.feedId))}
              strategy={verticalListSortingStrategy}
            >
              <ul className="m-0 list-none p-0">
                {ungrouped.map((feed) => (
                  <SortableFeedRow
                    key={feed.feedId}
                    feed={feed}
                    folderId={null}
                    folderNames={folderNames}
                    active={activeFeedId === feed.feedId}
                    pending={pending}
                  />
                ))}
              </ul>
            </SortableContext>
          </section>
        ) : null}
      </div>

      <DragOverlay>
        {activeDrag ? <DragPreview drag={activeDrag} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
