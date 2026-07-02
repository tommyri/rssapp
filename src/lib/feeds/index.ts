// Public interface of the feeds module. The rest of the app imports from here
// only — internals (fetch/parse/sanitize/discover) stay private so the fetcher
// can later move into its own process without touching callers (docs/business-option.md).
export {
  type FullContentResult,
  getOrExtractFullContent,
} from "./full-content";
export {
  type AddFeedResult,
  addFeedForUser,
  ensureFeed,
  type RefreshDueOptions,
  type RefreshDueSummary,
  type RefreshResult,
  refreshAllForSubscriber,
  refreshDueFeeds,
  refreshFeed,
} from "./ingest";
