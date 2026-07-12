import type { EmbedProvider } from "@/lib/embed-loading";

export type DeferredEmbed = {
  provider: EmbedProvider;
  label: string;
  href: string;
  frameSrc: string;
  aspectRatio: string;
};

const youtubeHosts = new Set(["www.youtube.com", "www.youtube-nocookie.com"]);

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|apos|quot|lt|gt);/gi,
    (entity) => {
      const named: Record<string, string> = {
        "&amp;": "&",
        "&apos;": "'",
        "&quot;": '"',
        "&lt;": "<",
        "&gt;": ">",
      };
      const lower = entity.toLowerCase();
      if (named[lower]) return named[lower];

      const codePoint = lower.startsWith("&#x")
        ? Number.parseInt(lower.slice(3, -1), 16)
        : Number.parseInt(lower.slice(2, -1), 10);
      return Number.isFinite(codePoint)
        ? String.fromCodePoint(codePoint)
        : entity;
    },
  );
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function attributeValue(attributes: string, name: string): string | null {
  const match = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
    "i",
  ).exec(attributes);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

export function deferredEmbedFromUrl(value: string): DeferredEmbed | null {
  let url: URL;
  try {
    url = new URL(decodeHtmlEntities(value));
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  if (youtubeHosts.has(host) && url.pathname.startsWith("/embed/")) {
    return {
      provider: "youtube",
      label: "YouTube video",
      href: url.toString(),
      frameSrc: url.toString(),
      aspectRatio: "16 / 9",
    };
  }

  if (host === "player.vimeo.com" && /^\/video\/\d+/.test(url.pathname)) {
    return {
      provider: "vimeo",
      label: "Vimeo video",
      href: url.toString(),
      frameSrc: url.toString(),
      aspectRatio: "16 / 9",
    };
  }

  if (["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(host)) {
    const match = url.pathname.match(/^\/(?:i\/web\/)?[^/]+\/status\/(\d+)/);
    if (!match) return null;

    const frameUrl = new URL("https://platform.twitter.com/embed/Tweet.html");
    frameUrl.searchParams.set("id", match[1]);
    frameUrl.searchParams.set("dnt", "true");
    return {
      provider: "tweet",
      label: "X post",
      href: url.toString(),
      frameSrc: frameUrl.toString(),
      aspectRatio: "1 / 1",
    };
  }

  return null;
}

export function deferredEmbedAnchorAttributes(embed: DeferredEmbed) {
  return {
    href: embed.href,
    "data-deferred-embed": embed.provider,
    "data-deferred-label": embed.label,
    "aria-label": `Load ${embed.label}`,
    target: "_blank",
    rel: "noopener noreferrer nofollow",
  };
}

function placeholderHtml(embed: DeferredEmbed): string {
  const attributes = deferredEmbedAnchorAttributes(embed);
  return `<a ${Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(" ")}>Load ${embed.label}</a>`;
}

/**
 * Converts safe, stored embed markup to ordinary links. This runs in the
 * browser too, so iframe HTML saved before deferred embeds shipped cannot load
 * a third party until the reader explicitly activates it.
 */
export function deferEmbedsHtml(html: string): string {
  const withoutFrames = html.replace(
    /<iframe\b([^>]*)>(?:[\s\S]*?<\/iframe\s*>)?/gi,
    (_iframe, attributes: string) => {
      const src = attributeValue(attributes, "src");
      const embed = src ? deferredEmbedFromUrl(src) : null;
      return embed ? placeholderHtml(embed) : "";
    },
  );

  return withoutFrames.replace(
    /<blockquote\b([^>]*)>([\s\S]*?)<\/blockquote\s*>/gi,
    (blockquote, attributes: string, contents: string) => {
      if (attributeValue(attributes, "data-deferred-embed") !== "tweet") {
        return blockquote;
      }
      const anchor = /<a\b([^>]*)>/i.exec(contents);
      const href = anchor ? attributeValue(anchor[1], "href") : null;
      const embed = href ? deferredEmbedFromUrl(href) : null;
      return embed?.provider === "tweet" ? placeholderHtml(embed) : blockquote;
    },
  );
}
