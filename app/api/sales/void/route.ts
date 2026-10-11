import { z } from "zod";
import { checkOrigin, AccessDeniedError } from "../../../../lib/auth";
import { voidSale, SaleError } from "../../../../lib/sales";
export async function POST(request: Request) {
  try {
    await checkOrigin();
    return Response.json({ id: await voidSale(await request.json()) });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof SaleError
            ? e.message
            : e instanceof AccessDeniedError
              ? "Faqat filial administratori bekor qiladi"
              : e instanceof z.ZodError
                ? "Sabab kamida 5 belgidan iborat bo‘lsin"
                : "Savdo bekor qilinmadi",
      },
      { status: e instanceof AccessDeniedError ? 403 : 400 },
    );
  }
}
