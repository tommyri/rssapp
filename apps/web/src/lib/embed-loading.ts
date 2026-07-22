export const EMBED_PROVIDERS = ["youtube", "vimeo", "tweet"] as const;

export type EmbedProvider = (typeof EMBED_PROVIDERS)[number];
export type EmbedLoadMode = "click" | "auto";

export interface EmbedLoadingPreferences {
  default: EmbedLoadMode;
  providers: Partial<Record<EmbedProvider, EmbedLoadMode>>;
}

export const EMBED_PROVIDER_LABELS: Record<EmbedProvider, string> = {
  youtube: "YouTube videos",
  vimeo: "Vimeo videos",
  tweet: "X posts",
};

export function isEmbedLoadMode(value: unknown): value is EmbedLoadMode {
  return value === "click" || value === "auto";
}

export function normalizeEmbedLoadingPreferences(
  value: unknown,
): EmbedLoadingPreferences {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const rawProviders =
    raw.providers && typeof raw.providers === "object"
      ? (raw.providers as Record<string, unknown>)
      : {};
  const providers: EmbedLoadingPreferences["providers"] = {};

  for (const provider of EMBED_PROVIDERS) {
    const mode = rawProviders[provider];
    if (isEmbedLoadMode(mode)) providers[provider] = mode;
  }

  return {
    default: isEmbedLoadMode(raw.default) ? raw.default : "click",
    providers,
  };
}

export function resolveEmbedLoading(
  preferences: EmbedLoadingPreferences | undefined,
  provider: EmbedProvider,
): EmbedLoadMode {
  const normalized = normalizeEmbedLoadingPreferences(preferences);
  return normalized.providers[provider] ?? normalized.default;
}
