import { NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, AccessDeniedError } from "../../../lib/auth";
import { setTargets, TargetError } from "../../../lib/targets";
export async function POST(request: Request) {
  try {
    await checkOrigin();
    return NextResponse.json(await setTargets(await request.json()));
  } catch (e) {
    if (e instanceof AccessDeniedError)
      return NextResponse.json(
        { error: "Rejani faqat rahbar belgilaydi" },
        { status: 403 },
      );
    if (e instanceof TargetError)
      return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof z.ZodError)
      return NextResponse.json(
        { error: "Reja qiymatlarini tekshiring" },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "Saqlanmadi. So‘rov manbasi va ulanishni tekshiring." },
      { status: 400 },
    );
  }
}
