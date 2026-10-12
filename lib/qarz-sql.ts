/**
 * Shartnoma qoldig'i - bitta joyda yozilgan formula.
 *
 *   qarz = jami − boshlang'ich to'lov − tasdiqlangan to'lovlar
 *                − bekor qilingan kelgusi ustama
 *
 * Tasdiq kutayotgan tushum qarzni kamaytirmaydi (PAY-06), bekor qilingan
 * to'lov ham sanalmaydi, muddatidan oldin yopishda bekor qilingan ustama
 * esa qarzdan ayriladi (PAY-08). Formulani har so'rovda qayta yozsak
 * bittasi yangilanmay qolib, qarz ikki xil chiqadi - shuning uchun
 * hammasi shu funksiyadan foydalanadi.
 */

/**
 * Qarzga sotishning qoldig'i - DOLLAR SENTIDA.
 *
 * Qarz turidagi shartnomada so'mdagi `total`/`down_payment` sotuv
 * kunidagi kursga bog'langan, shuning uchun qoldiq ular orqali emas,
 * dollar hisobidan chiqadi. Ustama yo'q, demak yopish tuzatishi ham yo'q.
 *
 * @param c shartnoma jadvalining taxallusi
 */
export const qarzCentsSql = (c = "c") =>
  `${c}.total_cents-${c}.down_cents` +
  `-COALESCE((SELECT sum(p.applied_cents) FROM payments p` +
  ` WHERE p.contract_id=${c}.id AND p.status='approved' AND p.voided_at IS NULL),0)`;

/**
 * Qoldiq so'mda - ikkala tur uchun.
 *
 * Qarzga sotishda dollardagi qoldiq SOTUV kursi bilan so'mga o'tkaziladi,
 * bugungi kurs bilan emas: shunda qarz to'liq to'langanda so'mdagi qoldiq
 * ham aynan nolga tushadi. Bugungi kursdagi qiymat kerak bo'lsa, u
 * dollardagi qoldiqdan alohida hisoblanadi.
 *
 * @param c shartnoma jadvalining taxallusi
 */
export const qarzSql = (c = "c") =>
  `(CASE WHEN ${c}.kind='qarz' THEN` +
  ` round((${qarzCentsSql(c)})*${c}.sale_rate/100.0)::bigint` +
  ` ELSE ${c}.total-${c}.down_payment` +
  `-COALESCE((SELECT sum(p.amount) FROM payments p` +
  ` WHERE p.contract_id=${c}.id AND p.status='approved' AND p.voided_at IS NULL),0)` +
  `-COALESCE((SELECT sum(x.markup_cancelled) FROM contract_closures x` +
  ` WHERE x.contract_id=${c}.id AND x.status='completed'),0) END)`;

/** Tasdiqlangan to'lovlar yig'indisi (avanssiz). */
export const tolanganSql = (c = "c") =>
  `COALESCE((SELECT sum(p.amount) FROM payments p` +
  ` WHERE p.contract_id=${c}.id AND p.status='approved' AND p.voided_at IS NULL),0)`;
