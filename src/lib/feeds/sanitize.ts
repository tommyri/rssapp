import sanitizeHtml from "sanitize-html";
import {
  deferEmbedsHtml,
  deferredEmbedAnchorAttributes,
  deferredEmbedFromUrl,
} from "./deferred-embeds";

// Feed HTML is untrusted. We sanitize once at ingest and store the result, so
// the reading pane can render it directly (docs/design-ux.md, docs/tech-stack.md).
const options: sanitizeHtml.IOptions = {
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
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer nofollow",
    }),
    img: sanitizeHtml.simpleTransform("img", { loading: "lazy" }),
    // Video embeds should never make a third-party request while an article is
    // being read. Keep the trusted URL as a normal link, then ArticleContent
    // swaps it for a frame only after a click.
    iframe: (_tagName, attribs) => {
      const embed = attribs.src ? deferredEmbedFromUrl(attribs.src) : null;
      return embed
        ? {
            tagName: "a",
            attribs: deferredEmbedAnchorAttributes(embed),
          }
        : { tagName: "span", attribs: {} };
    },
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

export function sanitizeArticleHtml(dirty: string): string {
  return deferEmbedsHtml(sanitizeHtml(dirty, options));
}
