import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkOrigin, digest } from "../../../lib/auth";
import { db } from "../../../lib/db";
export async function POST() {
  try {
    await checkOrigin();
    const token = (await cookies()).get("session")?.value;
    if (token)
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        digest(token),
      ]);
    const r = NextResponse.redirect(
      new URL("/login", process.env.APP_ORIGIN),
      303,
    );
    r.cookies.delete("session");
    return r;
  } catch {
    return new NextResponse("Ruxsat yo‘q", { status: 403 });
  }
}
