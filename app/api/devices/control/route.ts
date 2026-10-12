import { NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, AccessDeniedError } from "../../../../lib/auth";
import { controlDevice, ControlError } from "../../../../lib/device-control";
export async function POST(request: Request) {
  try {
    await checkOrigin();
    return NextResponse.json(await controlDevice(await request.json()));
  } catch (e) {
    if (e instanceof AccessDeniedError)
      return NextResponse.json(
        { error: "Qurilma nazoratini faqat rahbar boshqaradi" },
        { status: 403 },
      );
    if (e instanceof ControlError)
      return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof z.ZodError)
      return NextResponse.json(
        { error: "So‘rov maydonlarini tekshiring" },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "Saqlanmadi. So‘rov manbasi va ulanishni tekshiring." },
      { status: 400 },
    );
  }
}
