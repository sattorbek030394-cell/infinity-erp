import { z } from "zod";
import { checkOrigin, AccessDeniedError } from "../../../lib/auth";
import { createSale, SaleError } from "../../../lib/sales";
export async function POST(request: Request) {
  try {
    await checkOrigin();
    return Response.json({ id: await createSale(await request.json()) });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof SaleError
            ? e.message
            : e instanceof AccessDeniedError
              ? "Filialga yozish ruxsati yo‘q"
              : e instanceof z.ZodError
                ? "Qurilma, summa va usulni tekshiring"
                : "Savdo saqlanmadi",
      },
      { status: e instanceof AccessDeniedError ? 403 : 400 },
    );
  }
}
