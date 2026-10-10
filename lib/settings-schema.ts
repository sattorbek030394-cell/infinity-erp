import { z } from "zod";
export const staffRole = z.enum(["admin", "cashier", "viewer"]);
const branch = { branchId: z.uuid() };
export const settingsSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...branch,
      action: z.literal("rename"),
      name: z.string().trim().min(1).max(80),
    })
    .strict(),
  z
    .object({
      ...branch,
      action: z.literal("create"),
      email: z.email().trim().toLowerCase().max(254),
      password: z
        .string()
        .min(12)
        .refine((v) => Buffer.byteLength(v, "utf8") <= 72),
      role: staffRole,
    })
    .strict(),
  z
    .object({
      ...branch,
      action: z.literal("grant"),
      userId: z.uuid(),
      role: staffRole,
    })
    .strict(),
  z
    .object({
      ...branch,
      action: z.literal("role"),
      userId: z.uuid(),
      role: z.enum(["admin", "cashier", "viewer", "disabled"]),
    })
    .strict(),
]);
export type SettingsInput = z.infer<typeof settingsSchema>;
