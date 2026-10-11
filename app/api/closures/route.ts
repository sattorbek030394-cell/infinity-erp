import { NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, AccessDeniedError } from "../../../lib/auth";
import { closeContract, ClosureError } from "../../../lib/closure";
export async function POST(request: Request) {
  try {
    await checkOrigin();
    return NextResponse.json(await closeContract(await request.json()));
  } catch (e) {
    if (e instanceof AccessDeniedError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof ClosureError)
      return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof z.ZodError)
      return NextResponse.json(
        { error: "So‘rov maydonlarini tekshiring" },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "Bajarilmadi. So‘rov manbasi va ulanishni tekshiring." },
      { status: 400 },
    );
  }
}
