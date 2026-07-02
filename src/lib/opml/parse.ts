import { XMLParser } from "fast-xml-parser";

export interface OpmlEntry {
  xmlUrl: string;
  title: string | null;
  /** Nearest ancestor folder name, or null if at the root. */
  folderName: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Always give us an array so we don't branch on single-vs-many outlines.
  isArray: (tag) => tag === "outline",
});

interface OutlineNode {
  "@_xmlUrl"?: string;
  "@_xmlurl"?: string;
  "@_title"?: string;
  "@_text"?: string;
  outline?: OutlineNode[];
}

function walk(
  outlines: OutlineNode[] | undefined,
  folderName: string | null,
  out: OpmlEntry[],
): void {
  if (!outlines) return;
  for (const node of outlines) {
    const xmlUrl = node["@_xmlUrl"] ?? node["@_xmlurl"];
    const label = node["@_title"] ?? node["@_text"] ?? null;
    if (xmlUrl && /^https?:\/\//i.test(xmlUrl)) {
      out.push({ xmlUrl, title: label, folderName });
    } else if (node.outline) {
      // A container outline (no feed URL) is a folder. We support one level, so
      // descend using this outline's name and keep the nearest name for deeper nesting.
      walk(node.outline, label ?? folderName, out);
    }
  }
}

/** Parse OPML into a flat list of feed entries, each tagged with its folder. */
export function parseOpml(xml: string): OpmlEntry[] {
  const doc = parser.parse(xml) as {
    opml?: { body?: { outline?: OutlineNode[] } };
  };
  const entries: OpmlEntry[] = [];
  walk(doc.opml?.body?.outline, null, entries);
  return entries;
}
