import { z } from "zod";
import { checkOrigin, AccessDeniedError } from "../../../../lib/auth";
import { reverseCash, CashError } from "../../../../lib/cash";
export async function POST(request: Request) {
  try {
    await checkOrigin();
    return Response.json({ id: await reverseCash(await request.json()) });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof CashError
            ? e.message
            : e instanceof AccessDeniedError
              ? "Faqat administrator bekor qiladi"
              : e instanceof z.ZodError
                ? "Sabab kamida 5 belgidan iborat bo‘lsin"
                : "Bekor qilinmadi",
      },
      { status: e instanceof AccessDeniedError ? 403 : 400 },
    );
  }
}
