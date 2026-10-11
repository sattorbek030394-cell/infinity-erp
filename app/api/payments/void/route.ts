import { z } from "zod";
import { checkOrigin, AccessDeniedError } from "../../../../lib/auth";
import { voidPayment, PaymentVoidError } from "../../../../lib/payment-void";
export async function POST(request: Request) {
  try {
    await checkOrigin();
    return Response.json({ id: await voidPayment(await request.json()) });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof PaymentVoidError
            ? e.message
            : e instanceof AccessDeniedError
              ? "Faqat filial administratori bekor qiladi"
              : e instanceof z.ZodError
                ? "Sabab kamida 5 belgidan iborat bo‘lsin"
                : "To‘lov bekor qilinmadi",
      },
      { status: e instanceof AccessDeniedError ? 403 : 400 },
    );
  }
}
