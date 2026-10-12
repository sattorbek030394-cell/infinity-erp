import { NextResponse } from "next/server";
import { checkOrigin } from "../../../lib/auth";
import { writeInvestor } from "../../../lib/investor";

export async function POST(request: Request) {
  try {
    await checkOrigin();
    return NextResponse.json(await writeInvestor(await request.json()));
  } catch (e) {
    // Ruxsat yo'qligi alohida ko'rinadi: ekranda tugma yashirilgan
    // bo'lsa ham server o'zi tekshiradi.
    const xato = e instanceof Error ? e.message : "Saqlanmadi";
    return NextResponse.json(
      { error: xato },
      { status: xato === "Ruxsat yo‘q" ? 403 : 400 },
    );
  }
}
