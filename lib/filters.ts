import { z } from "zod";
export type SearchParams = Record<string, string | string[] | undefined>;
export type HistoryFilters = {
  q: string;
  method: string;
  from: string;
  to: string;
  page: number;
};
const single = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : "";
export function parseFilters(query: SearchParams): HistoryFilters {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .safeParse(single(query.page) || 1);
  const date = (v: string | string[] | undefined) =>
    z.iso.date().safeParse(single(v)).success ? single(v) : "";
  return {
    q: single(query.q).trim().slice(0, 80),
    method: ["cash", "card", "transfer"].includes(single(query.method))
      ? single(query.method)
      : "",
    from: date(query.from),
    to: date(query.to),
    page: page.success ? page.data : 1,
  };
}
export function matchesSearch(q: string, ...fields: unknown[]) {
  const term = q.trim().toLocaleLowerCase("uz-UZ");
  return fields.some((v) =>
    String(v ?? "")
      .toLocaleLowerCase("uz-UZ")
      .includes(term),
  );
}
export const methodNames: Record<string, string> = {
  cash: "Naqd",
  card: "Karta",
  transfer: "O‘tkazma",
};
export const money = (value: unknown) =>
  Number(value).toLocaleString("uz-UZ") + " UZS";
export const dateTime = (value: Date | string) =>
  new Date(value).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" });
export const dateOnly = (value: Date | string) =>
  new Date(value).toLocaleDateString("uz-UZ", { timeZone: "Asia/Tashkent" });
