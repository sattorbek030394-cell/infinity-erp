import { NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin } from "../../../lib/auth";
import { createRecord } from "../../../lib/service";
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
  } catch {
    return NextResponse.json(
      {
        error:
          "Saqlanmadi: ruxsat, qiymatlar, IMEI takrori yoki qoldiqni tekshiring.",
      },
      { status: 400 },
    );
  }
}
