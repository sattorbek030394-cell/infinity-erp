import {
  money,
  dateOnly,
  matchesSearch,
  type HistoryFilters,
} from "../../lib/filters";
import { Eslatma } from "./eslatma";

/** Mijozga yuboriladigan eslatma matni: kechikkan va kutilayotgan uchun. */
function eslatmaMatni(r: Record<string, any>) {
  const sana = r.first_unpaid ? dateOnly(r.first_unpaid) : "";
  const summa = money(r.next_amount ?? r.overdue ?? 0);
  const kech = Number(r.days_late) > 0;
  return (
    `Assalomu alaykum, ${r.customer_label}. Infinity do‘konidan eslatma. ` +
    (kech
      ? `${sana} kungi ${summa} to‘lov hali tushmadi (${r.days_late} kun kechikdi). ` +
        `Iltimos, bugun to‘lovni amalga oshiring yoki biz bilan bog‘laning.`
      : `Keyingi to‘lov muddati ${sana}, summasi ${summa}.`) +
    ` Qarz qoldig‘i: ${money(r.balance)}.` +
    ` To‘lovni allaqachon qilgan bo‘lsangiz, xabarni e’tiborsiz qoldiring.`
  );
}
export function ArrearsList({
  report,
  branch,
  filters,
  all,
}: {
  report: { today: string; rows: Record<string, any>[]; reserveBp: number };
  branch: string;
  filters: HistoryFilters;
  all: boolean;
}) {
  const found = report.rows.filter(
    (r) =>
      (all || Number(r.overdue) > 0) &&
      matchesSearch(filters.q, r.customer_label, r.id, r.model, r.imei),
  );
  // COL-02: kechikish guruhlari butun portfel bo'yicha, filtrdan qat'i nazar.
  const guruhlar = [
    { nom: "1-30 kun", lo: 1, hi: 30 },
    { nom: "31-60 kun", lo: 31, hi: 60 },
    { nom: "61-90 kun", lo: 61, hi: 90 },
    { nom: "91+ kun", lo: 91, hi: Infinity },
  ].map((g) => {
    const b = report.rows.filter(
      (r) =>
        Number(r.overdue) > 0 &&
        Number(r.days_late) >= g.lo &&
        Number(r.days_late) <= g.hi,
    );
    return {
      nom: g.nom,
      soni: b.length,
      summa: b.reduce((n, r) => n + Number(r.overdue), 0),
    };
  });
  const zaxira = Math.round(
    (report.rows.reduce((n, r) => n + Number(r.balance), 0) *
      report.reserveBp) /
      10000,
  );
  const pages = Math.max(1, Math.ceil(found.length / 20)),
    page = Math.min(filters.page, pages);
  const url = (p: number) =>
    "/erp?" +
    new URLSearchParams({
      branch,
      tab: "arrears",
      q: filters.q,
      status: all ? "all" : "overdue",
      page: String(p),
    });
  return (
    <>
      <h1>Qarzdorlar va kechikkan to‘lovlar</h1>
      <aside className="notice">
        Hisob sanasi: {report.today} (Toshkent). Bugungi to‘lov muddati hali
        kechikkan emas. Keyingi to‘lovlar eng eski oylikdan boshlab qoplanadi
        deb hisoblanadi. Boshlang‘ich to‘lov jadvalga kirmaydi. Bu hisobot
        yozuvlarni o‘zgartirmaydi; jarima hisoblanmaydi. Excel mosligi
        tasdiqlanmagan.
      </aside>
      <div className="cards">
        {guruhlar.map((g) => (
          <section key={g.nom}>
            <h2>{g.nom}</h2>
            <strong>{money(g.summa)}</strong>
            <p>{g.soni} ta shartnoma</p>
          </section>
        ))}
        <section>
          <h2>Zaxira ({report.reserveBp / 100}%)</h2>
          <strong>{money(zaxira)}</strong>
          <p>
            Portfeldan kutilayotgan qaytmaydigan qarz. Hisob emas, ogohlantirish
            ko‘rsatkichi.
          </p>
        </section>
      </div>
      <form className="searchbar" action="/erp" method="get">
        <input type="hidden" name="branch" value={branch} />
        <input type="hidden" name="tab" value="arrears" />
        <label>
          Qidirish
          <input
            name="q"
            type="search"
            maxLength={80}
            defaultValue={filters.q}
            placeholder="Mijoz belgisi, model yoki IMEI"
          />
        </label>
        <label>
          Holat
          <select name="status" defaultValue={all ? "all" : "overdue"}>
            <option value="overdue">Muddati o‘tgan</option>
            <option value="all">Barcha qarzdorlar</option>
          </select>
        </label>
        <button>Qidirish</button>
      </form>
      <p>
        {found.length} ta shartnoma. Ro‘yxatdagi jami qoldiq:{" "}
        {money(found.reduce((n, r) => n + Number(r.balance), 0))}. Muddati
        o‘tgan: {money(found.reduce((n, r) => n + Number(r.overdue), 0))}.
      </p>
      <table>
        <thead>
          <tr>
            <th>Mijoz / qurilma</th>
            <th>Jami qoldiq</th>
            <th>Muddati o‘tgan summa</th>
            <th>Eng eski qoplanmagan muddat</th>
            <th>Kechikish</th>
            <th>Eslatma</th>
          </tr>
        </thead>
        <tbody>
          {found.slice((page - 1) * 20, page * 20).map((r) => (
            <tr key={r.id}>
              <td>
                <a
                  className="textlink"
                  href={"/erp/contracts/" + r.id + "?branch=" + branch}
                >
                  {r.customer_label} →
                </a>
                <small>
                  {r.model} • {r.imei}
                </small>
              </td>
              <td>{money(r.balance)}</td>
              <td>{money(r.overdue)}</td>
              <td>{r.first_unpaid ? dateOnly(r.first_unpaid) : "—"}</td>
              <td>
                {Number(r.days_late) > 0 ? r.days_late + " kun" : "Kechikmagan"}
              </td>
              <td>
                <Eslatma text={eslatmaMatni(r)} phone={r.phone} />
              </td>
            </tr>
          ))}
          {!found.length ? (
            <tr>
              <td colSpan={6}>Mos shartnoma topilmadi.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <div className="branchbar">
        {page > 1 ? <a href={url(page - 1)}>← Oldingi</a> : null}
        <span>
          {page} / {pages} sahifa
        </span>
        {page < pages ? <a href={url(page + 1)}>Keyingi →</a> : null}
      </div>
    </>
  );
}
