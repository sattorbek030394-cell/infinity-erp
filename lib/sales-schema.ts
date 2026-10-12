import { z } from "zod";
export const saleVoidSchema = z
  .object({
    branchId: z.uuid(),
    saleId: z.uuid(),
    requestKey: z.uuid(),
    reason: z.string().trim().min(5).max(160),
  })
  .strict();
const amount = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^\d{1,13}$/)
      .transform(Number),
  ])
  .pipe(z.number().int().min(1).max(1000000000000));
export const saleSchema = z
  .object({
    branchId: z.uuid(),
    inventoryId: z.uuid(),
    requestKey: z.uuid(),
    amount,
    method: z.enum(["cash", "card", "transfer"]),
    customerLabel: z.string().trim().max(80).default(""),
  })
  .strict();
