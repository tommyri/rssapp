import { z } from "zod";
import { canonicalizeUrl } from "@/lib/canonical-url";

const baseMutationSchema = z.object({
  key: z.string().min(1).max(256),
  token: z.string().min(1).max(256),
  userId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  value: z.boolean(),
});

const itemMutationSchema = baseMutationSchema.extend({
  kind: z.literal("item"),
  field: z.enum(["read", "starred", "readLater"]),
});

const pageMutationSchema = baseMutationSchema.extend({
  kind: z.literal("page"),
  field: z.literal("read"),
});

const saveLinkMutationSchema = z.object({
  key: z.string().min(1).max(256),
  token: z.string().min(1).max(256),
  userId: z.number().int().positive(),
  kind: z.literal("save-link"),
  url: z
    .string()
    .max(2048)
    .refine((url) => canonicalizeUrl(url) !== null, {
      message: "Expected a valid web address.",
    }),
});

export const offlineMutationPayloadSchema = z.object({
  mutations: z
    .array(
      z.discriminatedUnion("kind", [
        itemMutationSchema,
        pageMutationSchema,
        saveLinkMutationSchema,
      ]),
    )
    .max(100),
});

export type OfflineSyncMutation = z.infer<
  typeof offlineMutationPayloadSchema
>["mutations"][number];
