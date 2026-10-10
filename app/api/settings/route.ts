import { NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, AccessDeniedError } from "../../../lib/auth";
import { updateSettings, SettingsError } from "../../../lib/settings";
export async function POST(request: Request) {
  try {
    await checkOrigin();
    return NextResponse.json(await updateSettings(await request.json()));
  } catch (e) {
    if (e instanceof AccessDeniedError)
      return NextResponse.json(
        { error: "Bu sozlamalarni boshqarishga ruxsat yo‘q" },
        { status: 403 },
      );
    if (e instanceof SettingsError)
      return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof z.ZodError)
      return NextResponse.json(
        {
          error:
            "Maydonlarni tekshiring: email, rol, filial nomi yoki parol noto‘g‘ri. Parol kamida 12 belgi va ko‘pi bilan 72 UTF-8 bayt bo‘lsin.",
        },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "Saqlanmadi. So‘rov manbasi va ulanishni tekshiring." },
      { status: 400 },
    );
  }
}
