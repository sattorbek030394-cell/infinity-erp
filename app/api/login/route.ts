import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { checkOrigin, digest } from "../../../lib/auth";
import { transaction } from "../../../lib/db";
const dummyHash = hash(randomBytes(32).toString("hex"), 12);
const credentials = z.object({
  email: z.email().max(254),
  password: z
    .string()
    .min(1)
    .refine((v) => Buffer.byteLength(v, "utf8") <= 72),
});
export async function POST(request: Request) {
  try {
    await checkOrigin();
    const f = await request.formData();
    const v = credentials.parse({
      email: String(f.get("email") ?? "").toLowerCase(),
      password: f.get("password"),
    });
    const token = await transaction(async (c) => {
      await c.query(
        "INSERT INTO login_attempts(email) VALUES($1) ON CONFLICT DO NOTHING",
        [v.email],
      );
      const a = await c.query(
        "SELECT * FROM login_attempts WHERE email=$1 FOR UPDATE",
        [v.email],
      );
      if (
        a.rows[0].blocked_until &&
        new Date(a.rows[0].blocked_until) > new Date()
      )
        return null;
      const r = await c.query("SELECT * FROM users WHERE email=$1", [v.email]);
      const valid = await compare(
        v.password,
        r.rows[0]?.password_hash ?? (await dummyHash),
      );
      if (!r.rowCount || !valid) {
        await c.query(
          "UPDATE login_attempts SET attempts=CASE WHEN blocked_until<now() THEN 1 ELSE attempts+1 END, blocked_until=CASE WHEN blocked_until<now() THEN NULL WHEN attempts>=4 THEN now()+interval '15 minutes' ELSE NULL END WHERE email=$1",
          [v.email],
        );
        return null;
      }
      await c.query("DELETE FROM login_attempts WHERE email=$1", [v.email]);
      const t = randomBytes(32).toString("hex");
      await c.query(
        "INSERT INTO sessions VALUES($1,$2,now()+interval '8 hours')",
        [digest(t), r.rows[0].id],
      );
      return t;
    });
    if (!token)
      return new NextResponse(
        "Email yoki parol noto‘g‘ri. Keyinroq qayta urinib ko‘ring.",
        { status: 401 },
      );
    const response = NextResponse.redirect(
      new URL("/erp", process.env.APP_ORIGIN),
      303,
    );
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 28800,
    });
    return response;
  } catch {
    return new NextResponse("Kirish amalga oshmadi", { status: 400 });
  }
}
