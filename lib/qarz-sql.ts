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
 *
 * @param c shartnoma jadvalining taxallusi
 */
export const qarzSql = (c = "c") =>
  `${c}.total-${c}.down_payment` +
  `-COALESCE((SELECT sum(p.amount) FROM payments p` +
  ` WHERE p.contract_id=${c}.id AND p.status='approved' AND p.voided_at IS NULL),0)` +
  `-COALESCE((SELECT sum(x.markup_cancelled) FROM contract_closures x` +
  ` WHERE x.contract_id=${c}.id AND x.status='completed'),0)`;

/** Tasdiqlangan to'lovlar yig'indisi (avanssiz). */
export const tolanganSql = (c = "c") =>
  `COALESCE((SELECT sum(p.amount) FROM payments p` +
  ` WHERE p.contract_id=${c}.id AND p.status='approved' AND p.voided_at IS NULL),0)`;
