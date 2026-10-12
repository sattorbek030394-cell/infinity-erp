import { NextResponse } from "next/server";
import { checkOrigin } from "../../../lib/auth";
import { transferAdvance } from "../../../lib/advance";

export async function POST(request: Request) {
  try {
    await checkOrigin();
    return NextResponse.json(await transferAdvance(await request.json()));
  } catch (e) {
    const xato = e instanceof Error ? e.message : "Saqlanmadi";
    return NextResponse.json(
      { error: xato },
      { status: xato === "Ruxsat yo‘q" ? 403 : 400 },
    );
  }
}
