import { dateTime, methodNames, money } from "../../lib/filters";
import type { readPaymentHistory } from "../../lib/history";
type History = Awaited<ReturnType<typeof readPaymentHistory>>;
export function PaymentHistory({
  history,
  branchId,
  url,
}: {
  history: History;
  branchId: string;
  url: string;
}) {
  const pageUrl = (page: number) => {
    const [path, query] = url.split("?");
    const search = new URLSearchParams(query);
    search.set("page", String(page));
    return path + "?" + search;
  };
  return (
    <>
      <p>{history.total} ta to‘lov topildi.</p>
      <table>
        <thead>
          <tr>
            <th>Vaqt</th>
            <th>Shartnoma</th>
            <th>Summa</th>
            <th>Usul</th>
            <th>To‘lov ID</th>
          </tr>
        </thead>
        <tbody>
          {history.payments.map((p) => (
            <tr key={p.id}>
              <td>{dateTime(p.created_at)}</td>
              <td>
                <a
                  className="textlink"
                  href={
                    "/erp/contracts/" + p.contract_id + "?branch=" + branchId
                  }
                >
                  {p.customer_label}
                </a>
                <small>
                  {p.model} • {p.imei}
                </small>
              </td>
              <td>{money(p.amount)}</td>
              <td>{methodNames[p.method] ?? p.method}</td>
              <td>
                <code>{p.id}</code>
              </td>
            </tr>
          ))}
          {!history.payments.length ? (
            <tr>
              <td colSpan={5}>To‘lov topilmadi.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <nav aria-label="To‘lovlar sahifalari">
        {history.page > 1 ? (
          <a href={pageUrl(history.page - 1)}>← Oldingi</a>
        ) : null}
        <span className="pagecount">
          {history.page} / {history.pages}
        </span>
        {history.page < history.pages ? (
          <a href={pageUrl(history.page + 1)}>Keyingi →</a>
        ) : null}
      </nav>
      <p>
        Sanalar Toshkent vaqti bilan. Boshlang‘ich to‘lov shartnomada alohida
        ko‘rsatiladi. To‘lovlar o‘chirilmaydi.
      </p>
    </>
  );
}
