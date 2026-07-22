import sanitizeHtml from "sanitize-html";
import {
  deferEmbedsHtml,
  deferredEmbedAnchorAttributes,
  deferredEmbedFromUrl,
} from "./deferred-embeds";

function httpBaseUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function resolveUrl(value: string | undefined, baseUrl: URL | null) {
  if (!value || !baseUrl || value.startsWith("#")) return value;
  try {
    const url = new URL(value, baseUrl);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol)
      ? url.href
      : value;
  } catch {
    return value;
  }
}

function resolveSrcset(value: string | undefined, baseUrl: URL | null) {
  if (!value || !baseUrl) return value;
  return value
    .split(",")
    .map((candidate) => {
      const match = /^(\S+)(\s+.*)?$/.exec(candidate.trim());
      if (!match) return candidate;
      const url = resolveUrl(match[1], baseUrl);
      return `${url ?? match[1]}${match[2] ?? ""}`;
    })
    .join(", ");
}

function resolvedAttributes(
  attribs: Record<string, string>,
  baseUrl: URL | null,
  names: string[],
) {
  const next = { ...attribs };
  for (const name of names) {
    const resolved = resolveUrl(next[name], baseUrl);
    if (resolved) next[name] = resolved;
  }
  if (next.srcset)
    next.srcset = resolveSrcset(next.srcset, baseUrl) ?? next.srcset;
  return next;
}

// Feed HTML is untrusted. We sanitize once at ingest and store the result, so
// the reading pane can render it directly (docs/design-ux.md, docs/tech-stack.md).
function sanitizerOptions(
  base: string | null | undefined,
): sanitizeHtml.IOptions {
  const baseUrl = httpBaseUrl(base);
  return {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "figure",
      "figcaption",
      "iframe",
      "video",
      "audio",
      "source",
    ]),
    allowedAttributes: {
      // target/rel must be allowed here too, or the transformTags below that add
      // them are undone by the attribute filter.
      a: [
        "href",
        "name",
        "title",
        "target",
        "rel",
        "data-deferred-embed",
        "data-deferred-label",
        "aria-label",
      ],
      blockquote: ["data-deferred-embed"],
      img: ["src", "srcset", "alt", "title", "width", "height", "loading"],
      iframe: ["src", "width", "height", "allow", "allowfullscreen"],
      video: ["src", "controls", "poster", "width", "height"],
      audio: ["src", "controls"],
      source: ["src", "type", "srcset"],
    },
    // No javascript:/data: URLs.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    // Only embed video from hosts we trust.
    allowedIframeHostnames: [
      "www.youtube.com",
      "www.youtube-nocookie.com",
      "player.vimeo.com",
    ],
    transformTags: {
      // Open originals in a new tab and never leak the referrer or pass link juice.
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...resolvedAttributes(attribs, baseUrl, ["href"]),
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      }),
      img: (_tagName, attribs) => ({
        tagName: "img",
        attribs: {
          ...resolvedAttributes(attribs, baseUrl, ["src"]),
          loading: "lazy",
        },
      }),
      // Video embeds should never make a third-party request while an article is
      // being read. Keep the trusted URL as a normal link, then ArticleContent
      // swaps it for a frame only after a click.
      iframe: (_tagName, attribs) => {
        const resolved = resolvedAttributes(attribs, baseUrl, ["src"]);
        const embed = resolved.src ? deferredEmbedFromUrl(resolved.src) : null;
        return embed
          ? {
              tagName: "a",
              attribs: deferredEmbedAnchorAttributes(embed),
            }
          : { tagName: "span", attribs: {} };
      },
      video: (_tagName, attribs) => ({
        tagName: "video",
        attribs: resolvedAttributes(attribs, baseUrl, ["src", "poster"]),
      }),
      audio: (_tagName, attribs) => ({
        tagName: "audio",
        attribs: resolvedAttributes(attribs, baseUrl, ["src"]),
      }),
      source: (_tagName, attribs) => ({
        tagName: "source",
        attribs: resolvedAttributes(attribs, baseUrl, ["src"]),
      }),
      // Tweet embed scripts are removed by the sanitizer. Preserve only an
      // explicit marker; deferEmbedsHtml finds the sanitized status link inside
      // and produces the same click-to-load placeholder as video embeds.
      blockquote: (tagName, attribs): sanitizeHtml.Tag => {
        if (attribs.class?.split(/\s+/).includes("twitter-tweet")) {
          return { tagName, attribs: { "data-deferred-embed": "tweet" } };
        }
        return { tagName, attribs: {} };
      },
    },
  };
}

/** Resolve safe relative media and links before they reach the reader DOM. */
export function resolveArticleResourceUrls(
  html: string,
  baseUrl: string | null | undefined,
): string {
  return sanitizeHtml(html, sanitizerOptions(baseUrl));
}

const resourceUrlAttribute =
  /\b(?:href|src|srcset|poster)\s*=\s*["'](?![a-z][a-z0-9+.-]*:|\/\/|#)/i;

/**
 * Older stored entries may predate URL normalization. Avoid re-sanitizing the
 * common already-absolute case, but repair those entries before they reach the
 * browser so a relative image can never resolve against our app's origin.
 */
export function normalizeStoredArticleHtml(
  html: string | null,
  baseUrl: string | null | undefined,
): string | null {
  if (
    !html ||
    !baseUrl ||
    (!resourceUrlAttribute.test(html) && !/\bsrcset\s*=/i.test(html))
  ) {
    return html;
  }
  return sanitizeArticleHtml(html, baseUrl);
}

export function sanitizeArticleHtml(
  dirty: string,
  baseUrl?: string | null,
): string {
  return deferEmbedsHtml(resolveArticleResourceUrls(dirty, baseUrl));
}
