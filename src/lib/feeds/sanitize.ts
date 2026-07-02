import sanitizeHtml from "sanitize-html";

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
    a: ["href", "name", "title", "target", "rel"],
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
  },
};

export function sanitizeArticleHtml(dirty: string): string {
  return sanitizeHtml(dirty, options);
}
