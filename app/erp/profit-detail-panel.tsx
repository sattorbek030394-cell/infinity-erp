import { money } from "../../lib/filters";
import { cashMoney } from "../../lib/cash-domain";
import type { readProfitDetail } from "../../lib/profit-detail";

/**
 * Hisobotdagi bitta raqamning ichi.
 *
 * Yig'indi yuqoridagi son bilan aynan teng chiqishi kerak - shuning
 * uchun u pastda alohida qator bo'lib turadi va solishtirish oson.
 */
export function ProfitDetailPanel({
  data,
  branch,
}: {
  data: Awaited<ReturnType<typeof readProfitDetail>>;
  branch: string;
}) {
  const marja = data.kind === "marja";
  const kurs = data.kind === "kursfarqi";
  return (
    <>
      <h1>
        {data.nomi} — {data.oy}
      </h1>
      <nav className="branchbar">
        <a href={"/erp?branch=" + branch + "&tab=profit&oy=" + data.oy}>
          ← Foyda hisobotiga qaytish
        </a>
      </nav>
      {data.rows.length ? (
        <>
          <table>
            <thead>
              <tr>
                <th>Sana</th>
                <th>Nima</th>
                <th>{marja ? "Narx" : kurs ? "Tushgan so‘m" : "Summa"}</th>
                <th>
                  {marja ? "Tannarx" : kurs ? "Kitob qiymati" : "Chiqim"}
                </th>
                <th>Natija</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.kun.split("-").reverse().join(".")}</td>
                  <td>
                    {r.nom}
                    {r.izoh ? <small>{r.izoh}</small> : null}
                  </td>
                  <td>{r.kirim ? money(r.kirim) : "—"}</td>
                  <td>
                    {r.chiqim
                      ? r.usd
                        ? cashMoney(r.chiqim, "cash_usd")
                        : money(r.chiqim)
                      : "—"}
                  </td>
                  <td>
                    <strong>
                      {r.usd
                        ? cashMoney(r.summa, "cash_usd")
                        : money(r.summa)}
                    </strong>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4}>
                  <strong>Jami — {data.rows.length} ta yozuv</strong>
                </td>
                <td>
                  <strong>{money(data.jami)}</strong>
                  {data.jamiUsd ? (
                    <small>
                      va {cashMoney(data.jamiUsd, "cash_usd")} dollarda
                    </small>
                  ) : null}
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            Bu yig‘indi hisobotdagi “{data.nomi}” soniga teng bo‘lishi kerak.
            {data.jamiUsd
              ? " Dollardagi xarajat alohida turadi: hisobotda u oy kursi bilan so‘mga qo‘shiladi."
              : ""}
          </p>
        </>
      ) : (
        <p>Bu oyda bunday yozuv yo‘q.</p>
      )}
    </>
  );
}
