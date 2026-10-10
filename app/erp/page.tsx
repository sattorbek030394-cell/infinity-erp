import { redirect } from "next/navigation";
import { z } from "zod";
import { currentUser } from "../../lib/auth";
import { db } from "../../lib/db";
import { readBranch } from "../../lib/service";
import { RecordForm } from "./record-form";
export const dynamic = "force-dynamic";
const money = (n: unknown) => Number(n).toLocaleString("uz-UZ") + " UZS";
export default async function ERP({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; tab?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const branches = (
    await db.query(
      "SELECT b.id,b.name FROM branches b JOIN memberships m ON m.branch_id=b.id AND m.tenant_id=b.tenant_id WHERE m.user_id=$1 ORDER BY b.name",
      [user.id],
    )
  ).rows;
  if (!branches.length)
    return (
      <main>
        <h1>Filial biriktirilmagan</h1>
        <p>Administratorga murojaat qiling.</p>
      </main>
    );
  const query = await searchParams;
  const branch = query.branch ?? branches[0].id;
  if (
    !z.uuid().safeParse(branch).success ||
    !branches.some((b) => b.id === branch)
  )
    return (
      <main>
        <h1>Filialga ruxsat yo‘q</h1>
      </main>
    );
  const tab = ["dashboard", "inventory", "contracts", "payments"].includes(
    query.tab ?? "",
  )
    ? query.tab!
    : "dashboard";
  const data = await readBranch(branch);
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
        <nav>
          {[
            ["dashboard", "Dashboard"],
            ["inventory", "Ombor"],
            ["contracts", "Nasiya"],
            ["payments", "To‘lovlar"],
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
                {data.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.model}</td>
                    <td>{i.imei}</td>
                    <td>{money(i.cost)}</td>
                    <td>{i.status === "available" ? "Omborda" : "Sotilgan"}</td>
                  </tr>
                ))}
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
            <table>
              <thead>
                <tr>
                  <th>Mijoz belgisi</th>
                  <th>Jami</th>
                  <th>Boshlang‘ich</th>
                  <th>Oy</th>
                  <th>Qoldiq</th>
                </tr>
              </thead>
              <tbody>
                {data.contracts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.customer_label}</td>
                    <td>{money(c.total)}</td>
                    <td>{money(c.down_payment)}</td>
                    <td>
                      <details>
                        <summary>{c.months} oy • Jadval</summary>
                        {data.installments
                          .filter((i) => i.contract_id === c.id)
                          .map((i) => (
                            <p key={i.sequence}>
                              {i.sequence}.{" "}
                              {new Date(i.due_date).toLocaleDateString(
                                "uz-UZ",
                                { timeZone: "Asia/Tashkent" },
                              )}{" "}
                              — {money(i.amount)}
                            </p>
                          ))}
                      </details>
                    </td>
                    <td>{money(c.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Foiz avtomatik hisoblanmaydi. Kelishilgan jami summa kiritiladi.
            </p>
          </>
        ) : null}
        {tab === "payments" ? (
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
            <table>
              <thead>
                <tr>
                  <th>Vaqt</th>
                  <th>Shartnoma</th>
                  <th>Summa</th>
                  <th>Usul</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {new Date(p.created_at).toLocaleString("uz-UZ", {
                        timeZone: "Asia/Tashkent",
                      })}
                    </td>
                    <td>
                      {
                        data.contracts.find((c) => c.id === p.contract_id)
                          ?.customer_label
                      }
                    </td>
                    <td>{money(p.amount)}</td>
                    <td>{p.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Oxirgi 100 ta to‘lov. To‘lovlar o‘chirilmaydi; qaytarish amaliyoti
              keyingi versiyada.
            </p>
          </>
        ) : null}
      </main>
    </>
  );
}
