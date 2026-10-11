import { NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, AccessDeniedError } from "../../../../lib/auth";
import {
  closeDay,
  reopenDay,
  ClosingError,
} from "../../../../lib/cash-closing";
import { CashError } from "../../../../lib/cash";
export async function POST(request: Request) {
  try {
    await checkOrigin();
    const body = await request.json();
    const result =
      body?.action === "reopen" ? await reopenDay(trim(body)) : await closeDay(trim(body));
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AccessDeniedError)
      return NextResponse.json(
        { error: "Bu amalga ruxsat yo‘q" },
        { status: 403 },
      );
    if (e instanceof ClosingError || e instanceof CashError)
      return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof z.ZodError)
      return NextResponse.json(
        { error: "Sanani va sanalgan summalarni tekshiring" },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "Saqlanmadi. So‘rov manbasi va ulanishni tekshiring." },
      { status: 400 },
    );
  }
}
/** `action` maydoni sxemalarda yo'q: strict sxema uni rad etadi. */
function trim(body: Record<string, unknown>) {
  const { action, ...rest } = body ?? {};
  void action;
  return rest;
}
