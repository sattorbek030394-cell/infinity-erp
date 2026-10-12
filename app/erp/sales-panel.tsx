import type { readSales } from "../../lib/sales";
import { dateTime, methodNames, type HistoryFilters } from "../../lib/filters";
import { cashMoney } from "../../lib/cash-domain";
import { SaleForm } from "./sale-form";
import { can } from "../../lib/domain";
import { SearchForm } from "./search-form";
export function SalesPanel({
  report,
  branch,
  items,
  filters,
}: {
  report: Awaited<ReturnType<typeof readSales>>;
  branch: string;
  items: { id: string; label: string }[];
  filters: HistoryFilters;
}) {
  const url =
    "/erp?" +
    new URLSearchParams({
      branch,
      tab: "sales",
      q: filters.q,
      method: filters.method,
      from: filters.from,
      to: filters.to,
    });
  return (
    <>
      <h1>Naqd savdo</h1>
      <p>
        To‘liq to‘langan qurilmalar savdosi: naqd UZS, karta yoki hisob raqam.
        Qarz yaratilmaydi. Tushumni Kassaga yana qo‘lda yozmang.
      </p>
      {can(report.role, "sale.create") ? (
        <SaleForm branch={branch} items={items} />
      ) : null}
      <SearchForm branchId={branch} tab="sales" filters={filters} status="" />
      <p>
        {report.count} ta savdo topildi. Tanlangan ro‘yxat tushumi:{" "}
        <strong>{cashMoney(report.total, "cash_uzs")}</strong>. Bu sof foyda
        yoki Kassa qoldig‘i emas.
      </p>
      <table>
        <thead>
          <tr>
            <th>Vaqt</th>
            <th>Qurilma / IMEI</th>
            <th>Mijoz belgisi</th>
            <th>Summa</th>
            <th>Usul</th>
            <th>Savdo ID</th>
          </tr>
        </thead>
        <tbody>
          {report.sales.map((s) => (
            <tr key={s.id}>
              <td>{dateTime(s.created_at)}</td>
              <td>
                {s.model}
                <small>{s.imei}</small>
              </td>
              <td>{s.customer_label || "—"}</td>
              <td>{cashMoney(s.amount, "cash_uzs")}</td>
              <td>{methodNames[s.method]}</td>
              <td>
                <code>{s.id}</code>
              </td>
            </tr>
          ))}
          {!report.sales.length ? (
            <tr>
              <td colSpan={6}>Savdo topilmadi.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <nav aria-label="Savdo sahifalari">
        {report.page > 1 ? (
          <a href={url + "&page=" + (report.page - 1)}>← Oldingi</a>
        ) : null}
        <span>
          {report.page} / {report.pages}
        </span>
        {report.page < report.pages ? (
          <a href={url + "&page=" + (report.page + 1)}>Keyingi →</a>
        ) : null}
      </nav>
    </>
  );
}
