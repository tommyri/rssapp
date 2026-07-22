import { z } from "zod";

const audioProgressInputSchema = z.object({
  itemId: z.number().int().positive(),
  audioUrl: z
    .string()
    .url()
    .max(4_000)
    .refine(
      (value) => /^https?:\/\//i.test(value),
      "Expected an HTTP(S) audio URL.",
    ),
  progress: z
    .number()
    .finite()
    .min(0)
    // A month is safely beyond normal feeds while keeping hostile calls bounded.
    .max(60 * 60 * 24 * 31)
    .nullable(),
});

export type AudioProgressInput = z.infer<typeof audioProgressInputSchema>;

/** Validate the small, user-scoped payload accepted by audio progress writers. */
export function parseAudioProgressInput(
  value: unknown,
): AudioProgressInput | null {
  const parsed = audioProgressInputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
