import { money } from "../../lib/filters";
import { cashMoney } from "../../lib/cash-domain";
import type { readProfit } from "../../lib/profit";

const OYLAR = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];
const oyNomi = (oy: string) => {
  const [y, m] = oy.split("-").map(Number);
  return `${OYLAR[m - 1]} ${y}`;
};

/**
 * Oylik foyda (TZ 6.9).
 *
 * Boshqaruv hisobi: sotuv marjasi + nasiya daromadi − xarajat. Har
 * ko'rsatkich qayerdan chiqqani yoniga yozilgan, chunki "sof foyda"
 * degan bitta raqamga ishonish uchun uning tarkibi ko'rinishi kerak.
 */
export function ProfitPanel({
  report,
  branch,
}: {
  report: Awaited<ReturnType<typeof readProfit>>;
  branch: string;
}) {
  const j = report.joriy;
  const usdSom = (sent: number) =>
    report.kurs ? Math.round((sent * report.kurs) / 100) : 0;
  return (
    <>
      <h1>Foyda — {oyNomi(report.oy)}</h1>
      <nav className="branchbar">
        {report.oylar.map((o) => (
          <a
            key={o.oy}
            className={o.oy === report.oy ? "active" : ""}
            href={"/erp?branch=" + branch + "&tab=profit&oy=" + o.oy}
          >
            {oyNomi(o.oy)}
          </a>
        ))}
      </nav>
      <div className="cards">
        <section>
          <h2>Sotuv marjasi</h2>
          <strong>{money(j.marja)}</strong>
          <p>
            Nasiya {j.nasiyaSoni} dona: {money(j.nasiyaNarx - j.nasiyaTannarx)}{" "}
            • naqd {j.naqdSoni} dona: {money(j.naqdNarx - j.naqdTannarx)}
          </p>
        </section>
        <section>
          <h2>Nasiya ustama daromadi</h2>
          <strong>{money(j.ustama)}</strong>
          <p>
            Tushgan to‘lovdagi ustama ulushi
            {j.bekorUstama
              ? `; erta yopishda ${money(j.bekorUstama)} bekor qilingan`
              : ""}
          </p>
        </section>
        <section>
          <h2>Xarajat</h2>
          <strong>{money(j.xarajatUzs + usdSom(j.xarajatUsd))}</strong>
          <p>
            So‘mda {money(j.xarajatUzs)}
            {j.xarajatUsd
              ? ` • dollarda ${cashMoney(j.xarajatUsd, "cash_usd")}`
              : ""}
          </p>
        </section>
        <section>
          <h2>Sof foyda</h2>
          <strong>{money(j.sofFoyda)}</strong>
          <p>Marja + nasiya daromadi − xarajat</p>
        </section>
      </div>
      {j.taqsimotUzs || j.taqsimotUsd ? (
        <aside className="notice">
          Shu oyda egasi va investorlar olgan pul:{" "}
          {money(j.taqsimotUzs + usdSom(j.taqsimotUsd))}. Bu xarajat emas,
          foyda taqsimoti — sof foydadan ayrilmagan.
        </aside>
      ) : null}
      <h2>Oylar bo‘yicha</h2>
      <table>
        <thead>
          <tr>
            <th>Oy</th>
            <th>Sotuv (dona)</th>
            <th>Sotuv summasi</th>
            <th>Tannarx</th>
            <th>Marja</th>
            <th>Nasiya daromadi</th>
            <th>Xarajat</th>
            <th>Sof foyda</th>
          </tr>
        </thead>
        <tbody>
          {report.oylar.map((o) => (
            <tr key={o.oy}>
              <td>
                <a href={"/erp?branch=" + branch + "&tab=profit&oy=" + o.oy}>
                  {oyNomi(o.oy)}
                </a>
              </td>
              <td>
                {o.nasiyaSoni + o.naqdSoni}
                <small>
                  nasiya {o.nasiyaSoni} • naqd {o.naqdSoni}
                </small>
              </td>
              <td>{money(o.nasiyaNarx + o.naqdNarx)}</td>
              <td>{money(o.nasiyaTannarx + o.naqdTannarx)}</td>
              <td>{money(o.marja)}</td>
              <td>{money(o.ustama)}</td>
              <td>{money(o.xarajatUzs + usdSom(o.xarajatUsd))}</td>
              <td>
                <strong>{money(o.sofFoyda)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.kategoriyalar.length ? (
        <>
          <h2>{oyNomi(report.oy)} xarajatlari</h2>
          <table>
            <thead>
              <tr>
                <th>Kategoriya</th>
                <th>So‘mda</th>
                <th>Dollarda</th>
              </tr>
            </thead>
            <tbody>
              {report.kategoriyalar.map((k) => (
                <tr key={k.category}>
                  <td>{k.category}</td>
                  <td>{BigInt(k.uzs) ? money(k.uzs) : "—"}</td>
                  <td>
                    {BigInt(k.usd) ? cashMoney(k.usd, "cash_usd") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      <aside className="notice">
        Bu boshqaruv hisobi, rasmiy buxgalteriya foydasi emas. Nasiya
        daromadi to‘lov tushganda tan olinadi, shartnoma tuzilganda emas.
        Boshlang‘ich to‘lov qurilma narxining bir qismi — nasiya daromadiga
        kirmaydi. Telefon xaridi va ta‘minotchiga to‘lov xarajat emas:
        ular tannarx orqali marjada hisobga olingan.
        {report.kurs
          ? ` Dollardagi xarajat 1 USD = ${money(report.kurs)} kursi bilan so‘mga o‘tkazildi.`
          : " Kurs jadvalida yozuv yo‘q, shuning uchun dollardagi xarajat so‘mga qo‘shilmadi."}
      </aside>
    </>
  );
}
