import { z } from "zod";

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

export const offlineMutationPayloadSchema = z.object({
  mutations: z
    .array(
      z.discriminatedUnion("kind", [itemMutationSchema, pageMutationSchema]),
    )
    .max(100),
});

export type OfflineSyncMutation = z.infer<
  typeof offlineMutationPayloadSchema
>["mutations"][number];
