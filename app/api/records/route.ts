import { NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, AccessDeniedError } from "../../../lib/auth";
import { createRecord } from "../../../lib/service";

/**
 * Xodimga nima noto'g'ri ekanini aniq aytamiz: qaysi majburiy maydon
 * to'ldirilmagani, IMEI takrori va h.k. Baza xatosining ichki matni
 * (jadval, ustun nomlari) esa tashqariga chiqarilmaydi.
 */
function xatoMatni(e: unknown) {
  if (e instanceof z.ZodError) {
    const xabarlar = [...new Set(e.issues.map((i) => i.message))];
    return xabarlar.join(". ");
  }
  if (e instanceof AccessDeniedError) return "Filialga yozish ruxsati yo‘q";
  const kod = (e as { code?: unknown })?.code;
  if (kod === "23505")
    return "Bu IMEI yoki yozuv allaqachon mavjud — takrorlab bo‘lmaydi.";
  // Baza (pg) xatolarida 5 belgili kod bo'ladi - ularni ko'rsatmaymiz.
  if (e instanceof Error && typeof kod !== "string") return e.message;
  return "Saqlanmadi: ruxsat, qiymatlar, IMEI takrori yoki qoldiqni tekshiring.";
}

export async function POST(request: Request) {
  try {
    await checkOrigin();
    const body = await request.json();
    const v = z
      .object({
        branchId: z.uuid(),
        kind: z.enum(["inventory", "contracts", "qarz", "payments"]),
        data: z.unknown(),
      })
      .parse(body);
    const id = await createRecord(v.branchId, v.kind, v.data);
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: xatoMatni(e) }, { status: 400 });
  }
}
