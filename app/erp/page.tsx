import { redirect } from "next/navigation";
import { z } from "zod";
import { currentUser } from "../../lib/auth";
import { db } from "../../lib/db";
import { readBranch } from "../../lib/service";
import { can, rollarAmal } from "../../lib/domain";
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
import { readClosings } from "../../lib/cash-closing";
import { ClosingPanel } from "./closing-panel";
import { readSales } from "../../lib/sales";
import { SalesPanel } from "./sales-panel";
import { readPending } from "../../lib/payment-approval";
import { ApprovalsPanel } from "./approvals-panel";
import { readClosures } from "../../lib/closure";
import { ClosuresPanel } from "./closures-panel";
import { readSuppliers } from "../../lib/supplier";
import { SuppliersPanel } from "./suppliers-panel";
import { readProfit } from "../../lib/profit";
import { ProfitPanel } from "./profit-panel";
import { cashMoney } from "../../lib/cash-domain";
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
      "SELECT b.id,b.name FROM branches b JOIN memberships m ON m.branch_id=b.id AND m.tenant_id=b.tenant_id WHERE m.user_id=$1 AND m.role=ANY($2) ORDER BY b.name",
      [user.id, rollarAmal("read")],
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
      "approvals",
      "closures",
      "arrears",
      "cash",
      "sales",
      "suppliers",
      "profit",
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
  const closings = tab === "cash" ? await readClosings(branch) : null;
  const sales = tab === "sales" ? await readSales(branch, filters) : null;
  const pending = tab === "approvals" ? await readPending(branch) : null;
  const closures = tab === "closures" ? await readClosures(branch) : null;
  const suppliers = tab === "suppliers" ? await readSuppliers(branch) : null;
  const profit =
    tab === "profit"
      ? await readProfit(
          branch,
          typeof query.oy === "string" ? query.oy : "",
        )
      : null;
  const items = data.items.filter(
    (i) =>
      matchesSearch(
        filters.q,
        i.brand,
        i.model,
        i.memory,
        i.color,
        i.imei,
        i.imei2,
      ) &&
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
            ["approvals", "Tasdiq kutayotgan"],
            ["closures", "Erta yopilgan"],
            ["arrears", "Qarzdorlar"],
            ["cash", "Kassa"],
            ["sales", "Naqd savdo"],
            ["suppliers", "Ta‘minotchilar"],
            ["profit", "Foyda"],
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
          <>
            <CashPanel report={cash} branch={branch} role={data.role} />
            {closings ? (
              <ClosingPanel
                branchId={branch}
                report={closings}
                today={cash.today}
                balances={cash.balances}
              />
            ) : null}
          </>
        ) : null}
        {sales ? (
          <SalesPanel
            report={sales}
            branch={branch}
            filters={filters}
            items={data.items
              .filter((i) => i.status === "available")
              .map((i) => ({ id: i.id, label: i.model + " / " + i.imei }))}
          />
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
                <h2>Olingan nasiya to‘lovlari</h2>
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
              {Number(data.inTransit.n) > 0 ? (
                <section>
                  <h2>Undiruvchi qo‘lida</h2>
                  <strong>{money(data.inTransit.total)}</strong>
                  <p>
                    {data.inTransit.n} ta naqd tushum kassir tasdig‘ini
                    kutmoqda. Kassa qoldig‘iga kirmagan.
                  </p>
                </section>
              ) : null}
              {data.unreleased > 0 ? (
                <section>
                  <h2>Nazorat ochilmagan</h2>
                  <strong>{data.unreleased}</strong>
                  <p>
                    Qarzi yopilgan, lekin iCloud/MDM nazorati hali
                    chiqarilmagan qurilmalar.
                  </p>
                </section>
              ) : null}
              {Number(data.advances) > 0 ? (
                <section>
                  <h2>Mijoz avanslari</h2>
                  <strong>{money(data.advances)}</strong>
                  <p>
                    Qarzdan ortib tushgan pul. Qarz hisobiga kirmaydi, mijoz
                    hisobida turadi.
                  </p>
                </section>
              ) : null}
            </div>
            <section>
              <h2>Naqd savdo tushumi</h2>
              <strong>{cashMoney(data.salesTotal, "cash_uzs")}</strong>
              <p>
                To‘liq to‘langan savdolar. Kassa qoldig‘i yoki sof foyda emas.
              </p>
            </section>
          </>
        ) : null}
        {tab === "inventory" ? (
          <>
            <h1>Ombor</h1>
            {can(data.role, "inventory.create") && (
              <RecordForm
                branchId={branch}
                kind="inventory"
                items={[]}
                kurs={data.kurs}
              />
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
                  <th>Qurilma</th>
                  <th>IMEI</th>
                  <th>Tannarx</th>
                  <th>Prognoz narx</th>
                  <th>Holat</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {[i.brand, i.model, i.memory, i.color]
                        .filter(Boolean)
                        .join(" ")}
                      {i.condition || i.battery ? (
                        <small>
                          {[
                            i.condition,
                            i.battery ? "batareyka " + i.battery + "%" : "",
                          ]
                            .filter(Boolean)
                            .join(" • ")}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      {i.imei}
                      {i.imei2 ? <small>{i.imei2}</small> : null}
                    </td>
                    <td>
                      {money(i.cost)}
                      {i.cost_usd_cents ? (
                        <small>
                          {cashMoney(i.cost_usd_cents, "cash_usd")} ×{" "}
                          {money(i.cost_rate)}
                        </small>
                      ) : null}
                    </td>
                    <td>{i.expected_price ? money(i.expected_price) : "—"}</td>
                    <td>{i.status === "available" ? "Omborda" : "Sotilgan"}</td>
                  </tr>
                ))}
                {!items.length ? (
                  <tr>
                    <td colSpan={5}>
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
            {can(data.role, "contract.create") && (
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
            {can(data.role, "payment.create") && (
              <RecordForm
                branchId={branch}
                kind="payments"
                kurs={data.kurs}
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
        {tab === "approvals" && pending ? (
          <>
            <h1>Tasdiq kutayotgan tushumlar</h1>
            <ApprovalsPanel branchId={branch} pending={pending} />
          </>
        ) : null}
        {tab === "profit" && profit ? (
          <ProfitPanel report={profit} branch={branch} />
        ) : null}
        {tab === "suppliers" && suppliers ? (
          <>
            <h1>Yetkazib beruvchilar va qarzlar</h1>
            <SuppliersPanel branchId={branch} report={suppliers} />
          </>
        ) : null}
        {tab === "closures" && closures ? (
          <>
            <h1>Muddatidan oldin yopilgan shartnomalar</h1>
            <ClosuresPanel report={closures} branchId={branch} />
          </>
        ) : null}
      </main>
    </>
  );
}
