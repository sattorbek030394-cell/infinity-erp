import { readCash } from "../../lib/cash";
import { cashMoney, walletNames, type Wallet } from "../../lib/cash-domain";
import { CashForms } from "./cash-forms";
import { CashReverse } from "./cash-reverse";
export function CashPanel({
  report,
  branch,
  role,
}: {
  report: Awaited<ReturnType<typeof readCash>>;
  branch: string;
  role: string;
}) {
  const wallets = Object.keys(walletNames) as Wallet[],
    url = "/erp?branch=" + branch + "&tab=cash&page=";
  return (
    <>
      <h1>Kassa</h1>
      <p>Bugun: {report.today}. Har bir hamyon va filialning puli alohida.</p>
      <div className="cards">
        {wallets.map((w) => {
          const b = report.balances.find((b) => b.wallet === w);
          return (
            <section key={w}>
              <h2>{walletNames[w]}</h2>
              <strong>
                {b?.balance == null
                  ? "Qoldiq noma’lum"
                  : cashMoney(b.balance, w)}
              </strong>
              <p>
                {b?.opening_date
                  ? "Boshlang‘ich: " +
                    cashMoney(b.opening_minor, w) +
                    " • " +
                    b.opening_date
                  : "Boshlang‘ich qoldiq belgilanmagan"}
              </p>
              <small>
                Yozilgan harakatlar: {cashMoney(b?.movement ?? 0, w)}
              </small>
              {b?.balance != null && BigInt(b.balance) < 0 ? (
                <p role="alert">
                  Qoldiq manfiy. Boshlang‘ich qoldiq va harakatlarni tekshiring.
                </p>
              ) : null}
            </section>
          );
        })}
      </div>
      <aside className="notice">
        Yangi nasiya boshlang‘ich va keyingi to‘lovlari avtomatik yoziladi —
        ularni yana qo‘lda kiritmang. Eski to‘lovlar avtomatik ko‘chirilmagan.
        Omborga qurilma qo‘shish kassadan pul ayirmaydi; haqiqiy xarid to‘lovini
        chiqim sifatida yozing.
      </aside>
      <CashForms
        branch={branch}
        today={report.today}
        role={role}
        unconfigured={wallets.filter(
          (w) => !report.balances.find((b) => b.wallet === w)?.opening_date,
        )}
      />
      <h2>Kassa daftari</h2>
      <p>
        {report.total} ta harakat. {report.page}/{report.pages} sahifa.
      </p>
      <table>
        <thead>
          <tr>
            <th>Sana</th>
            <th>Hamyon</th>
            <th>Sabab</th>
            <th>Summa</th>
            <th>Izoh / manba</th>
          </tr>
        </thead>
        <tbody>
          {report.entries.map((e) => (
            <tr key={e.id}>
              <td>{e.entry_date}</td>
              <td>{walletNames[e.wallet as Wallet]}</td>
              <td>{e.category}</td>
              <td>
                {BigInt(e.amount_minor) > 0 ? "+" : ""}
                {cashMoney(e.amount_minor, e.wallet as Wallet)}
              </td>
              <td>
                {e.note ||
                  (e.sale_id
                    ? "Naqd savdo • avtomatik"
                    : e.payment_id || e.contract_id
                      ? "Nasiya • avtomatik"
                      : "Qo‘lda yozilgan")}
                {e.reversed ? <small>Bekor qilingan</small> : null}
                {role === "admin" &&
                e.operation_id &&
                !e.reversal_of &&
                !e.reversed ? (
                  <CashReverse branch={branch} entryId={e.id} />
                ) : null}
              </td>
            </tr>
          ))}
          {!report.entries.length ? (
            <tr>
              <td colSpan={5}>Hali harakat yozilmagan.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p>
        {report.page > 1 ? (
          <a href={url + (report.page - 1)}>← Oldingi</a>
        ) : null}{" "}
        {report.page < report.pages ? (
          <a href={url + (report.page + 1)}>Keyingi →</a>
        ) : null}
      </p>
      <p>
        USD UZS ga aylantirilmaydi. Filiallararo o‘tkazma va to‘liq investor
        hisobi V1 ga kirmagan. Excel hisobotida hamyon qoldiqlari va to‘liq
        Kassa daftari bor.
      </p>
    </>
  );
}
