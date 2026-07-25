"use client";

import { ArticleAudioPlayer } from "@/components/article-audio-player";
import { ArticleContent } from "@/components/article-content";
import { hasExpandedArticleContent } from "@/lib/article-display";
import {
  type AudioProgressByUrl,
  withAudioProgress,
} from "@/lib/audio-progress";
import { persistItemAudioProgress } from "@/lib/audio-progress-client";
import type { EmbedLoadingPreferences } from "@/lib/embed-loading";
import type {
  ArticleHighlight,
  HighlightAnchor,
} from "@/lib/highlight-selection";
import type { ReaderItem } from "@/lib/reader";

export interface ArticleRowBodyHighlights {
  list: ArticleHighlight[];
  focusId?: number;
  /** Resolves false when the highlight could not be persisted. */
  create: (
    item: ReaderItem,
    anchor: HighlightAnchor,
    note: string,
  ) => Promise<boolean>;
  updateNote: (highlightId: number, note: string) => Promise<boolean>;
  remove: (highlightId: number) => Promise<void>;
}

interface Props {
  item: ReaderItem;
  /** Full text when it has been extracted, otherwise the feed-provided body. */
  contentHtml: string | null;
  fullTextPending: boolean;
  fullTextUnavailable: boolean;
  /** The live extraction watcher has stopped watching this pending page. */
  extractionWatchGaveUp: boolean;
  embedLoading: EmbedLoadingPreferences;
  highlights: ArticleRowBodyHighlights;
  /** Measured for reading progress, so it must wrap the article text only. */
  articleRef: (node: HTMLDivElement | null) => void;
  onAudioProgress: (progress: AudioProgressByUrl) => void;
}

/**
 * What an open article shows above its action bar. Every branch here is a
 * different answer to "is there anything to read yet?" — a saved page still
 * being fetched, one that failed, an episode with audio but no text, an article
 * whose full text is still being prepared, or the content itself.
 */
export function ArticleRowBody({
  item,
  contentHtml,
  fullTextPending,
  fullTextUnavailable,
  extractionWatchGaveUp,
  embedLoading,
  highlights,
  articleRef,
  onAudioProgress,
}: Props) {
  const isPage = item.kind === "page";

  return (
    <>
      {isPage && item.pageStatus === "pending" ? (
        <p className="text-sm text-muted-foreground italic">
          {extractionWatchGaveUp
            ? "Still fetching a readable copy — reload to check for it."
            : "Fetching a readable copy…"}
        </p>
      ) : isPage && item.pageStatus === "error" ? (
        <p className="text-sm text-muted-foreground italic">
          {item.pageError ?? "Couldn't fetch a readable copy of this page."}
        </p>
      ) : hasExpandedArticleContent(contentHtml, item.audioUrl) ? (
        <div ref={articleRef}>
          {item.audioUrl ? (
            <ArticleAudioPlayer
              itemId={item.id}
              url={item.audioUrl}
              type={item.audioType}
              initialProgress={item.audioProgress[item.audioUrl] ?? null}
              onProgressChange={(audioUrl, progress) =>
                onAudioProgress(
                  withAudioProgress(item.audioProgress, audioUrl, progress),
                )
              }
            />
          ) : null}
          {contentHtml ? (
            <ArticleContent
              html={contentHtml}
              embedLoading={embedLoading}
              itemId={item.kind === "item" ? item.id : undefined}
              audioProgress={item.audioProgress}
              onAudioProgressChange={
                item.kind === "item"
                  ? (audioUrl, progress) => {
                      onAudioProgress(
                        withAudioProgress(
                          item.audioProgress,
                          audioUrl,
                          progress,
                        ),
                      );
                      return persistItemAudioProgress({
                        itemId: item.id,
                        audioUrl,
                        progress,
                      });
                    }
                  : undefined
              }
              highlights={highlights.list}
              focusHighlightId={highlights.focusId}
              onCreateHighlight={(anchor, note) =>
                highlights.create(item, anchor, note)
              }
              onUpdateHighlightNote={highlights.updateNote}
              onDeleteHighlight={highlights.remove}
            />
          ) : (
            <p className="text-sm text-muted-foreground italic">
              This episode does not include article text.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          {fullTextPending
            ? "Preparing a readable copy of this article…"
            : "No content in this feed entry."}
        </p>
      )}

      {fullTextUnavailable ? (
        <p className="mt-3 text-sm text-muted-foreground">
          We couldn’t get a readable full-text copy. The feed version above
          remains available when provided.
        </p>
      ) : null}
    </>
  );
}
