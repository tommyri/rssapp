"use server";

import { z } from "zod";
import { getCurrentUserId } from "@/lib/current-user";
import {
  type ArticleHighlight,
  type HighlightTarget,
  MAX_HIGHLIGHT_NOTE_LENGTH,
  MAX_HIGHLIGHT_QUOTE_LENGTH,
} from "@/lib/highlight-selection";
import {
  createHighlight,
  deleteHighlight,
  listHighlights,
  updateHighlightNote,
} from "@/lib/highlights";

const targetSchema = z.object({
  kind: z.enum(["item", "page"]),
  id: z.number().int().positive(),
});

const anchorSchema = z
  .object({
    quote: z.string().min(1).max(MAX_HIGHLIGHT_QUOTE_LENGTH),
    startOffset: z.number().int().min(0),
    endOffset: z.number().int().positive(),
  })
  .refine(
    (anchor) =>
      anchor.quote.trim().length > 0 &&
      anchor.endOffset - anchor.startOffset === anchor.quote.length,
    { message: "The selected text could not be saved." },
  );

const noteSchema = z
  .string()
  .max(MAX_HIGHLIGHT_NOTE_LENGTH)
  .transform((note) => note.trim() || null);

function parseTarget(kind: unknown, id: unknown): HighlightTarget | null {
  const target = targetSchema.safeParse({ kind, id });
  return target.success ? target.data : null;
}

export async function listHighlightsAction(
  kind: unknown,
  id: unknown,
): Promise<ArticleHighlight[]> {
  const target = parseTarget(kind, id);
  if (!target) return [];
  const userId = await getCurrentUserId();
  return listHighlights(userId, target);
}

export async function createHighlightAction(
  kind: unknown,
  id: unknown,
  anchor: unknown,
  note: unknown = "",
): Promise<
  { ok: true; highlight: ArticleHighlight } | { ok: false; error: string }
> {
  const target = parseTarget(kind, id);
  const parsedAnchor = anchorSchema.safeParse(anchor);
  const parsedNote = noteSchema.safeParse(note);
  if (!target || !parsedAnchor.success || !parsedNote.success) {
    return { ok: false, error: "Select a short passage from this article." };
  }
  const userId = await getCurrentUserId();
  const highlight = await createHighlight(
    userId,
    target,
    parsedAnchor.data,
    parsedNote.data,
  );
  return highlight
    ? { ok: true, highlight }
    : { ok: false, error: "This article is no longer available." };
}

export async function updateHighlightNoteAction(
  highlightId: unknown,
  note: unknown,
): Promise<
  { ok: true; highlight: ArticleHighlight } | { ok: false; error: string }
> {
  const id = z.number().int().positive().safeParse(highlightId);
  const parsedNote = noteSchema.safeParse(note);
  if (!id.success || !parsedNote.success) {
    return { ok: false, error: "Notes can be up to 2,000 characters." };
  }
  const userId = await getCurrentUserId();
  const highlight = await updateHighlightNote(userId, id.data, parsedNote.data);
  return highlight
    ? { ok: true, highlight }
    : { ok: false, error: "That highlight is no longer available." };
}

export async function deleteHighlightAction(
  highlightId: unknown,
): Promise<boolean> {
  const id = z.number().int().positive().safeParse(highlightId);
  if (!id.success) return false;
  const userId = await getCurrentUserId();
  return deleteHighlight(userId, id.data);
}
