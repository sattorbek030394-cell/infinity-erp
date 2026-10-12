import { z } from "zod";
import { AccessDeniedError } from "../../../../../lib/auth";
import { readShartnoma } from "../../../../../lib/history";
import { shartnomaHtml } from "../../../../../lib/shartnoma";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Chop etiladigan shartnoma. Brauzer oynasida ochiladi, Ctrl+P bilan
// chop etiladi yoki PDF qilib saqlanadi - alohida dastur kerak emas.
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const xato = (status: number, matn: string) =>
    new Response(
      `<!doctype html><html lang="uz"><meta charset="utf-8">
<title>Shartnoma</title><p style="font:16px system-ui;padding:24px">${matn}</p>`,
      { status, headers },
    );
  const { id } = await ctx.params;
  const branch = new URL(request.url).searchParams.get("branch") ?? "";
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(branch).success)
    return xato(400, "Havola noto‘g‘ri.");
  try {
    const m = await readShartnoma(branch, id);
    if (!m) return xato(404, "Shartnoma topilmadi.");
    if (!m.raqam)
      return xato(
        422,
        "Bu shartnomaga raqam berilmagan, shuning uchun chop etilmaydi. " +
          "Raqam faqat dastur orqali tuzilgan shartnomalarda bo‘ladi.",
      );
    return new Response(shartnomaHtml(m), { headers });
  } catch (e) {
    if (e instanceof AccessDeniedError)
      return xato(403, "Bu filialga ruxsat yo‘q.");
    return xato(500, "Shartnomani tayyorlab bo‘lmadi.");
  }
}
