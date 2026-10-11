import { z } from "zod";
import { checkOrigin, AccessDeniedError } from "../../../lib/auth";
import { mutateCash, CashError } from "../../../lib/cash";
export async function POST(request: Request) {
  try {
    await checkOrigin();
    return Response.json({ id: await mutateCash(await request.json()) });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof CashError
            ? e.message
            : e instanceof AccessDeniedError
              ? "Filialga yozish ruxsati yo‘q"
              : e instanceof z.ZodError
                ? "Maydon, sana va summalarni tekshiring"
                : "Saqlanmadi. Qayta tekshiring.",
      },
      { status: e instanceof AccessDeniedError ? 403 : 400 },
    );
  }
}
