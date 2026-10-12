import { money } from "../../lib/filters";
import { cashMoney } from "../../lib/cash-domain";
import type { readProfit } from "../../lib/profit";
import { TargetForm } from "./target-form";
import { TelegramText } from "./telegram-text";
import { METRIC_NOMI } from "../../lib/target-names";

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
/** Har kuni guruhga tashlanadigan qisqa xulosa. */
function telegram(r: Awaited<ReturnType<typeof readProfit>>) {
  const j = r.joriy;
  const som = (n: number) => Number(n).toLocaleString("uz-UZ");
  const kun = r.bugun.split("-").reverse().join(".");
  const satrlar = [
    `Infinity — ${kun}`,
    "",
    `Sotuv: ${j.nasiyaSoni + j.naqdSoni + j.qarzSoni} dona (nasiya ${j.nasiyaSoni} / naqd ${j.naqdSoni} / qarzga ${j.qarzSoni})`,
    `Sotuv summasi: ${som(j.nasiyaNarx + j.naqdNarx + j.qarzNarx)} so'm`,
    `Sotuv marjasi: ${som(j.marja)} so'm`,
    `Nasiya daromadi: ${som(j.ustama)} so'm`,
    ...(j.kursFarqi ? [`Kurs farqi: ${som(j.kursFarqi)} so'm`] : []),
    `Xarajat: ${som(j.xarajatUzs + (r.kurs ? Math.round((j.xarajatUsd * r.kurs) / 100) : 0))} so'm`,
    `Sof foyda: ${som(j.sofFoyda)} so'm`,
    "",
    `Bugungi to'lovlar: ${som(r.bugungi.summa)} so'm (${r.bugungi.soni} ta)`,
    `Nasiya qoldig'i: ${som(r.portfel.qoldiq)} so'm`,
    `Qarzga sotish qoldig'i: ${som(r.portfel.qarzQoldiq)} so'm`,
    `Kechikkan: ${som(r.kechikkan.summa)} so'm (${r.kechikkan.soni} shartnoma)`,
    `Omborda: ${r.ombor.n} dona, tannarxi ${som(r.ombor.tannarx)} so'm`,
  ];
  const reja = r.reja.filter((x) => x.plan > 0);
  if (reja.length) {
    satrlar.push("", `${oyNomi(r.oy)} rejasi:`);
    for (const x of reja)
      satrlar.push(
        `  ${METRIC_NOMI[x.metric]}: ${x.foiz}% bajarildi` +
          (x.kunlik ? `, kunlik kerak ${som(x.kunlik)}` : ""),
      );
  }
  return satrlar.join("\n");
}

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
  // Har raqamning ichini ochadigan havola: bitta songa ishonish uchun
  // uning tarkibi ko'rinishi kerak.
  const ich = (kind: string) =>
    `/erp?branch=${branch}&tab=profit&oy=${report.oy}&tafsil=${kind}`;
  return (
    <>
      <h1>Foyda — {oyNomi(report.oy)}</h1>
      {j.muzlatilgan ? (
        <aside className="notice">
          Bu oy yopilgan: raqamlar yopilgan paytda muzlatilgan va keyingi
          tuzatishlar ularni o‘zgartirmaydi. Tuzatish joriy oyda ko‘rinadi.
        </aside>
      ) : null}
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
          <strong>
            <a className="textlink" href={ich("marja")}>
              {money(j.marja)}
            </a>
          </strong>
          <p>
            Nasiya {j.nasiyaSoni} dona: {money(j.nasiyaNarx - j.nasiyaTannarx)}{" "}
            • naqd {j.naqdSoni} dona: {money(j.naqdNarx - j.naqdTannarx)}
            {j.qarzSoni ? (
              <>
                {" "}
                • qarzga {j.qarzSoni} dona:{" "}
                {money(j.qarzNarx - j.qarzTannarx)}
              </>
            ) : null}
          </p>
        </section>
        <section>
          <h2>Nasiya ustama daromadi</h2>
          <strong>
            <a className="textlink" href={ich("ustama")}>
              {money(j.ustama)}
            </a>
          </strong>
          <p>
            Tushgan to‘lovdagi ustama ulushi
            {j.bekorUstama
              ? `; erta yopishda ${money(j.bekorUstama)} bekor qilingan`
              : ""}
          </p>
        </section>
        <section>
          <h2>Xarajat</h2>
          <strong>
            <a className="textlink" href={ich("xarajat")}>
              {money(j.xarajatUzs + usdSom(j.xarajatUsd))}
            </a>
          </strong>
          <p>
            So‘mda {money(j.xarajatUzs)}
            {j.xarajatUsd
              ? ` • dollarda ${cashMoney(j.xarajatUsd, "cash_usd")}`
              : ""}
          </p>
        </section>
        <section>
          <h2>Kurs farqi</h2>
          <strong>
            <a className="textlink" href={ich("kursfarqi")}>
              {money(j.kursFarqi)}
            </a>
          </strong>
          <p>
            {j.kursFarqi
              ? "Dollardagi qarz boshqa kursda to‘langanidan"
              : "Dollardagi qarzda kurs o‘zgarmagan"}
          </p>
        </section>
        <section>
          <h2>Sof foyda</h2>
          <strong>{money(j.sofFoyda)}</strong>
          <p>Marja + nasiya daromadi + kurs farqi − xarajat</p>
        </section>
      </div>
      {j.taqsimotUzs || j.taqsimotUsd ? (
        <aside className="notice">
          Shu oyda egasi va investorlar olgan pul:{" "}
          {money(j.taqsimotUzs + usdSom(j.taqsimotUsd))}. Bu xarajat emas,
          foyda taqsimoti — sof foydadan ayrilmagan.
        </aside>
      ) : null}
      <div className="cards">
        <section>
          <h2>Ombordagi tovar</h2>
          <strong>{report.ombor.n} dona</strong>
          <p>
            Tannarxi {money(report.ombor.tannarx)}
            {Number(report.ombor.narxlangan) ? (
              <>
                {" "}
                • kutilayotgan foyda {money(report.ombor.kutilgan)} (
                {report.ombor.narxlangan} donaga narx qo‘yilgan)
              </>
            ) : (
              " • prognoz narx kiritilmagan"
            )}
          </p>
        </section>
        <section>
          <h2>Qarzga sotish qoldig‘i</h2>
          <strong>{money(report.portfel.qarzQoldiq)}</strong>
          <p>
            {Number(report.portfel.qarzSent)
              ? `Dollarda ${cashMoney(report.portfel.qarzSent, "cash_usd")} — ustamasiz, muddatli qarz`
              : "Ochiq qarzga sotuv yo‘q"}
          </p>
        </section>
        <section>
          <h2>Nasiya portfeli</h2>
          <strong>{money(report.portfel.qoldiq)}</strong>
          <p>
            Asosiy qarz {money(report.portfel.asosiy)} • kelishilgan ustama{" "}
            {money(report.portfel.ustama)}
          </p>
        </section>
      </div>
      <TargetForm
        branchId={branch}
        month={report.oy}
        rows={report.reja}
        qolganKun={report.qolganKun}
        canEdit={report.canEdit}
      />
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
            <th>Kurs farqi</th>
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
                {o.muzlatilgan ? <small>muzlatilgan</small> : null}
              </td>
              <td>
                {o.nasiyaSoni + o.naqdSoni + o.qarzSoni}
                <small>
                  nasiya {o.nasiyaSoni} • naqd {o.naqdSoni} • qarzga{" "}
                  {o.qarzSoni}
                </small>
              </td>
              <td>{money(o.nasiyaNarx + o.naqdNarx + o.qarzNarx)}</td>
              <td>
                {money(o.nasiyaTannarx + o.naqdTannarx + o.qarzTannarx)}
              </td>
              <td>{money(o.marja)}</td>
              <td>{money(o.ustama)}</td>
              <td>{money(o.kursFarqi)}</td>
              <td>{money(o.xarajatUzs + usdSom(o.xarajatUsd))}</td>
              <td>
                <strong>{money(o.sofFoyda)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.sotuvchilar.length ? (
        <>
          <h2>Sotuvchilar — {oyNomi(report.oy)}</h2>
          <table>
            <thead>
              <tr>
                <th>Sotuvchi</th>
                <th>Nasiya (dona / summa)</th>
                <th>Nasiya marjasi</th>
                <th>Kelishilgan ustama</th>
                <th>Naqd (dona / summa)</th>
                <th>Naqd marjasi</th>
                <th>Qarzga (dona / marja)</th>
                <th>Jami marja</th>
                {report.bonusBp ? <th>Bonus</th> : null}
              </tr>
            </thead>
            <tbody>
              {report.sotuvchilar.map((r) => (
                <tr key={r.nom}>
                  <td>{r.nom}</td>
                  <td>
                    {r.nasiyaDona} dona
                    <small>{money(r.nasiyaNarx)}</small>
                  </td>
                  <td>{money(r.nasiyaMarja)}</td>
                  <td>{money(r.ustama)}</td>
                  <td>
                    {r.naqdDona} dona
                    <small>{money(r.naqdNarx)}</small>
                  </td>
                  <td>{money(r.naqdMarja)}</td>
                  <td>
                    {r.qarzDona} dona
                    <small>{money(r.qarzMarja)}</small>
                  </td>
                  <td>
                    <strong>{money(r.marja)}</strong>
                  </td>
                  {report.bonusBp ? (
                    <td>
                      <strong>{money(r.bonus)}</strong>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            {report.bonusBp
              ? `Bonus — marjaning ${report.bonusBp / 100}% i (sozlamalarda belgilanadi). Hisoblab ko‘rsatiladi, to‘lov kassa orqali xarajat sifatida yoziladi. `
              : ""}
            “Kelishilgan ustama” — shu oyda tuzilgan shartnomalarning jami
            ustamasi. U to‘lovlar tushgani sari daromadga aylanadi, shuning
            uchun marjaga qo‘shilmagan.
          </p>
        </>
      ) : null}
      {report.kanallar.length ? (
        <>
          <h2>Sotuv kanallari — {oyNomi(report.oy)}</h2>
          <table>
            <thead>
              <tr>
                <th>Kanal</th>
                <th>Sotuv (dona)</th>
                <th>Sotuv summasi</th>
                <th>Marja</th>
                <th>Kelishilgan ustama</th>
              </tr>
            </thead>
            <tbody>
              {report.kanallar.map((r) => (
                <tr key={r.nom}>
                  <td>{r.nom}</td>
                  <td>
                    {r.nasiyaDona + r.naqdDona + r.qarzDona}
                    <small>
                      nasiya {r.nasiyaDona} • naqd {r.naqdDona} • qarzga{" "}
                      {r.qarzDona}
                    </small>
                  </td>
                  <td>{money(r.nasiyaNarx + r.naqdNarx + r.qarzNarx)}</td>
                  <td>{money(r.marja)}</td>
                  <td>{money(r.ustama)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Mijoz qaysi kanaldan kelgani sotuv paytida belgilanadi. Reklama
            xarajatini shu jadval bilan solishtirib, bir mijoz qancha turgani
            ko‘rinadi.
          </p>
        </>
      ) : null}
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
      <TelegramText text={telegram(report)} />
      <aside className="notice">
        Raqamning ustiga bossangiz uning ichi ochiladi — qaysi sotuv,
        to‘lov yoki xarajatdan chiqqani qatorma-qator ko‘rinadi. Bu
        boshqaruv hisobi, rasmiy buxgalteriya foydasi emas. Nasiya
        daromadi to‘lov tushganda tan olinadi, shartnoma tuzilganda emas.
        Boshlang‘ich to‘lov qurilma narxining bir qismi — nasiya daromadiga
        kirmaydi. Kurs farqi faqat qarzga sotishda tug‘iladi: u yerda qarz
        dollarda, so‘mdagi qiymati esa sotuv kursida qotgan. Nasiya
        shartnomasi so‘mda yuritilgani uchun unda kurs farqi bo‘lmaydi. Telefon xaridi va ta‘minotchiga to‘lov xarajat emas:
        ular tannarx orqali marjada hisobga olingan.
        {report.kurs
          ? ` Dollardagi xarajat 1 USD = ${money(report.kurs)} kursi bilan so‘mga o‘tkazildi.`
          : " Kurs jadvalida yozuv yo‘q, shuning uchun dollardagi xarajat so‘mga qo‘shilmadi."}
      </aside>
    </>
  );
}
