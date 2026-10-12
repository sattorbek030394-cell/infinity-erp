import { z } from "zod";
import { ROLLAR } from "./domain";
// Rol nomlari `lib/domain.ts` dagi ROLLAR bilan bir xil bo'lsin: bazadagi
// CHECK ham shu nomlarni qabul qiladi.
export const staffRole = z.enum(ROLLAR);
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
  // Narx va bonus sozlamalari (TZ SALE). Nol - o'chirilgan.
  z
    .object({
      ...branch,
      action: z.literal("narx"),
      // Ekranda foiz, bazada bazis punkt: 15% -> 1500.
      minMarginPct: z.coerce
        .number()
        .min(0)
        .max(100)
        .transform((v) => Math.round(v * 100)),
      sellerBonusPct: z.coerce
        .number()
        .min(0)
        .max(100)
        .transform((v) => Math.round(v * 100)),
    })
    .strict(),
  z
    .object({
      ...branch,
      action: z.literal("role"),
      userId: z.uuid(),
      role: z.enum([...ROLLAR, "disabled"]),
    })
    .strict(),
]);
export type SettingsInput = z.infer<typeof settingsSchema>;
