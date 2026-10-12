import { money, dateOnly, dateTime } from "../../lib/filters";
import type { readClosures } from "../../lib/closure";

/**
 * PAY-09: muddatidan oldin yopilgan shartnomalar.
 *
 * Faqat yakunlangan va qayta ochilmagan yopishlar ko'rinadi: tasdiq
 * kutayotganlari va teskari qilinganlari bu ro'yxatga kirmaydi.
 * Olib tashlangan ustama real tushumdan alohida ko'rsatiladi.
 */
export function ClosuresPanel({
  report,
  branchId,
}: {
  report: Awaited<ReturnType<typeof readClosures>>;
  branchId: string;
}) {
  return (
    <>
      <div className="cards">
        <section>
          <h2>Erta yopilgan shartnomalar</h2>
          <strong>{report.jami.soni}</strong>
        </section>
        <section>
          <h2>Yakuniy yopish to‘lovlari</h2>
          <strong>{money(report.jami.yopish)}</strong>
        </section>
        <section>
          <h2>Avtomatik olib tashlangan ustama</h2>
          <strong>{money(report.jami.bekor)}</strong>
          <p>Real pul tushumi emas: olinmagan daromad.</p>
        </section>
        <section>
          <h2>Shu shartnomalardan jami tushum</h2>
          <strong>{money(report.jami.tolangan)}</strong>
        </section>
      </div>
      <table>
        <thead>
          <tr>
            <th>Shartnoma</th>
            <th>Mijoz / qurilma</th>
            <th>Shartnoma sanasi</th>
            <th>Jadval oxiri</th>
            <th>Yopilgan</th>
            <th>Muddat / o‘tgan</th>
            <th>Yopishdan oldingi qarz</th>
            <th>Olib tashlangan ustama</th>
            <th>Yakuniy summa</th>
            <th>Tasdiqlagan</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.id}>
              <td>{r.number ?? "—"}</td>
              <td>
                <a
                  href={"/erp/contracts/" + r.contract_id + "?branch=" + branchId}
                >
                  {r.customer_label}
                </a>
                <br />
                <small>
                  {r.model} / {r.imei}
                </small>
              </td>
              <td>{dateOnly(r.start_date)}</td>
              <td>{dateOnly(r.quote_date)}</td>
              <td>{r.decided_at ? dateTime(r.decided_at) : "—"}</td>
              <td>
                {r.months} oy / {r.periods_elapsed}
              </td>
              <td>{money(r.debt_before)}</td>
              <td>{money(r.markup_cancelled)}</td>
              <td>{money(r.close_amount)}</td>
              <td>{r.decided_email ?? "—"}</td>
            </tr>
          ))}
          {!report.rows.length ? (
            <tr>
              <td colSpan={10}>
                Muddatidan oldin yopilgan shartnoma yo‘q.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </>
  );
}
