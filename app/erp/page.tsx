import { redirect } from "next/navigation";
import { z } from "zod";
import { currentUser } from "../../lib/auth";
import { db } from "../../lib/db";
import { readBranch } from "../../lib/service";
import { readPaymentHistory } from "../../lib/history";
import {
  matchesSearch,
  parseFilters,
  money,
  type SearchParams,
} from "../../lib/filters";
import { RecordForm } from "./record-form";
import { SearchForm } from "./search-form";
import { PaymentHistory } from "./payment-history";
import { readArrears } from "../../lib/arrears";
import { ArrearsList } from "./arrears-list";
import { readCash } from "../../lib/cash";
import { CashPanel } from "./cash-panel";
export const dynamic = "force-dynamic";
export default async function ERP({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const branches = (
    await db.query(
      "SELECT b.id,b.name FROM branches b JOIN memberships m ON m.branch_id=b.id AND m.tenant_id=b.tenant_id WHERE m.user_id=$1 AND m.role IN ('admin','cashier','viewer') ORDER BY b.name",
      [user.id],
    )
  ).rows;
  if (!branches.length)
    return (
      <main>
        <h1>Faol filialga ruxsat yo‘q</h1>
        <p>Administratorga murojaat qiling.</p>
        <form action="/api/logout" method="post">
          <button>Chiqish</button>
        </form>
      </main>
    );
  const query = await searchParams;
  const branch =
    typeof query.branch === "string" ? query.branch : branches[0].id;
  if (
    !z.uuid().safeParse(branch).success ||
    !branches.some((b) => b.id === branch)
  )
    return (
      <main>
        <h1>Filialga ruxsat yo‘q</h1>
      </main>
    );
  const tab =
    typeof query.tab === "string" &&
    [
      "dashboard",
      "inventory",
      "contracts",
      "payments",
      "arrears",
      "cash",
    ].includes(query.tab)
      ? query.tab
      : "dashboard";
  const filters = parseFilters(query);
  const status =
    typeof query.status === "string" &&
    ["available", "sold", "active", "paid"].includes(query.status)
      ? query.status
      : "";
  const data = await readBranch(branch);
  const arrears = tab === "arrears" ? await readArrears(branch) : null;
  const cash = tab === "cash" ? await readCash(branch, filters.page) : null;
  const items = data.items.filter(
    (i) =>
      matchesSearch(filters.q, i.model, i.imei) &&
      (!["available", "sold"].includes(status) || i.status === status),
  );
  const contracts = data.contracts.filter(
    (c) =>
      matchesSearch(filters.q, c.customer_label, c.id, c.model, c.imei) &&
      (!(status === "active" || status === "paid") ||
        (status === "active"
          ? Number(c.balance) > 0
          : Number(c.balance) === 0)),
  );
  const history =
    tab === "payments" ? await readPaymentHistory(branch, filters) : null;
  const historyUrl =
    "/erp?" +
    new URLSearchParams({
      branch,
      tab,
      q: filters.q,
      method: filters.method,
      from: filters.from,
      to: filters.to,
    });
  return (
    <>
      <header>
        <strong>∞ Infinity ERP</strong>
        <span>{user.email}</span>
        <form action="/api/logout" method="post">
          <button>Chiqish</button>
        </form>
      </header>
      <main>
        <div className="branchbar">
          {branches.map((b) => (
            <a
              className={branch === b.id ? "active" : ""}
              key={b.id}
              href={"/erp?branch=" + b.id + "&tab=" + tab}
            >
              {b.name}
            </a>
          ))}
        </div>
        <aside className="notice">
          V1 • Excel va Kassa hisob-kitoblari auditdan o‘tmagan. Har bir
          filialning hisobi alohida.
        </aside>
        <nav aria-label="Modullar">
          {data.role === "admin" ? (
            <a href={"/erp/settings?branch=" + branch}>Sozlamalar</a>
          ) : null}
          {[
            ["dashboard", "Dashboard"],
            ["inventory", "Ombor"],
            ["contracts", "Nasiya"],
            ["payments", "To‘lovlar"],
            ["arrears", "Qarzdorlar"],
            ["cash", "Kassa"],
          ].map(([key, label]) => (
            <a
              className={tab === key ? "active" : ""}
              key={key}
              href={"/erp?branch=" + branch + "&tab=" + key}
            >
              {label}
            </a>
          ))}
        </nav>
        <p>
          <a className="textlink" href={"/api/export?branch=" + branch}>
            Excel hisobotini yuklash ↓
          </a>
          <small>
            Tanlangan filialning barcha yozuvlari. Ekran filtrlari eksportga
            qo‘llanmaydi.
          </small>
        </p>
        {arrears ? (
          <ArrearsList
            report={arrears}
            branch={branch}
            filters={filters}
            all={query.status === "all"}
          />
        ) : null}
        {cash ? (
          <CashPanel report={cash} branch={branch} role={data.role} />
        ) : null}
        {tab === "dashboard" ? (
          <>
            <h1>Dashboard</h1>
            <div className="cards">
              <section>
                <h2>Ombordagi qurilmalar</h2>
                <strong>
                  {data.items.filter((i) => i.status === "available").length}
                </strong>
              </section>
              <section>
                <h2>Nasiya qoldig‘i</h2>
                <strong>
                  {money(
                    data.contracts.reduce((n, c) => n + Number(c.balance), 0),
                  )}
                </strong>
              </section>
              <section>
                <h2>Olingan mablag‘</h2>
                <strong>
                  {money(
                    data.contracts.reduce(
                      (n, c) => n + Number(c.total) - Number(c.balance),
                      0,
                    ),
                  )}
                </strong>
                <p>Boshlang‘ich va keyingi to‘lovlar. Kassa balansi emas.</p>
              </section>
            </div>
          </>
        ) : null}
        {tab === "inventory" ? (
          <>
            <h1>Ombor</h1>
            {data.role !== "viewer" && (
              <RecordForm branchId={branch} kind="inventory" items={[]} />
            )}
            <SearchForm
              branchId={branch}
              tab={tab}
              filters={filters}
              status={status}
            />
            <p>{items.length} ta qurilma topildi.</p>
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>IMEI</th>
                  <th>Tannarx</th>
                  <th>Holat</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.model}</td>
                    <td>{i.imei}</td>
                    <td>{money(i.cost)}</td>
                    <td>{i.status === "available" ? "Omborda" : "Sotilgan"}</td>
                  </tr>
                ))}
                {!items.length ? (
                  <tr>
                    <td colSpan={4}>
                      Qurilma topilmadi. Qidiruv yoki holat filtrini
                      o‘zgartiring.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </>
        ) : null}
        {tab === "contracts" ? (
          <>
            <h1>Nasiya shartnomalari</h1>
            {data.role !== "viewer" && (
              <RecordForm
                branchId={branch}
                kind="contracts"
                items={data.items
                  .filter((i) => i.status === "available")
                  .map((i) => ({ id: i.id, label: i.model + " / " + i.imei }))}
              />
            )}
            <SearchForm
              branchId={branch}
              tab={tab}
              filters={filters}
              status={status}
            />
            <p>{contracts.length} ta shartnoma topildi.</p>
            <table>
              <thead>
                <tr>
                  <th>Mijoz / qurilma</th>
                  <th>Jami</th>
                  <th>Boshlang‘ich</th>
                  <th>Muddat</th>
                  <th>Qoldiq</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <a
                        className="textlink"
                        href={"/erp/contracts/" + c.id + "?branch=" + branch}
                      >
                        {c.customer_label} →
                      </a>
                      <small>
                        {c.model} • {c.imei}
                      </small>
                    </td>
                    <td>{money(c.total)}</td>
                    <td>{money(c.down_payment)}</td>
                    <td>{c.months} oy</td>
                    <td>
                      {money(c.balance)}
                      <small>
                        {Number(c.balance) > 0
                          ? "Qarzi bor"
                          : "To‘liq to‘langan"}
                      </small>
                    </td>
                  </tr>
                ))}
                {!contracts.length ? (
                  <tr>
                    <td colSpan={5}>
                      Shartnoma topilmadi. Qidiruv yoki holat filtrini
                      o‘zgartiring.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <p>
              Shartnomani bosib, oylik jadval va to‘lov tarixini ko‘ring. Foiz
              avtomatik hisoblanmaydi.
            </p>
          </>
        ) : null}
        {tab === "payments" && history ? (
          <>
            <h1>To‘lovlar</h1>
            {data.role !== "viewer" && (
              <RecordForm
                branchId={branch}
                kind="payments"
                items={data.contracts
                  .filter((c) => Number(c.balance) > 0)
                  .map((c) => ({
                    id: c.id,
                    label: c.customer_label + " / " + money(c.balance),
                  }))}
              />
            )}
            <SearchForm
              branchId={branch}
              tab={tab}
              filters={filters}
              status=""
            />
            <PaymentHistory
              history={history}
              branchId={branch}
              url={historyUrl}
            />
          </>
        ) : null}
      </main>
    </>
  );
}
