import { db } from "./db";

/**
 * Bugungi (yoki eng oxirgi ma'lum) USD kursi: 1 USD uchun butun so'm.
 *
 * To'lov formasida kurs maydoniga shu qiymat qo'yiladi; kassir uni
 * o'zgartira oladi, chunki haqiqiy kelishilgan kurs boshqa bo'lishi
 * mumkin. Kurs jadvalida yozuv bo'lmasa bo'sh qoladi.
 */
export async function kunlikKurs(tenantId: string) {
  const r = await db.query(
    `SELECT rate::text FROM exchange_rates
 WHERE tenant_id=$1 AND day<=(now() AT TIME ZONE 'Asia/Tashkent')::date
 ORDER BY day DESC LIMIT 1`,
    [tenantId],
  );
  return (r.rows[0]?.rate as string | undefined) ?? "";
}
