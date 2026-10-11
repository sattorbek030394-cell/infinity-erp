import { redirect, notFound } from "next/navigation";
import { z } from "zod";
import { currentUser, AccessDeniedError } from "../../../../lib/auth";
import { readContract, readPaymentHistory } from "../../../../lib/history";
import {
  parseFilters,
  money,
  dateOnly,
  type SearchParams,
} from "../../../../lib/filters";
import { RecordForm } from "../../record-form";
import { can } from "../../../../lib/domain";
import { PaymentHistory } from "../../payment-history";
export const dynamic = "force-dynamic";
export default async function ContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const query = await searchParams;
  const branch = typeof query.branch === "string" ? query.branch : "";
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(branch).success)
    notFound();
  let detail: Awaited<ReturnType<typeof readContract>>;
  try {
    detail = await readContract(branch, id);
  } catch (e) {
    if (e instanceof AccessDeniedError) notFound();
    throw e;
  }
  if (!detail) notFound();
  const c = detail.contract;
  const filters = {
    ...parseFilters(query),
    q: "",
    method: "",
    from: "",
    to: "",
  };
  const history = await readPaymentHistory(branch, filters, id);
  return (
    <>
      <header>
        <strong>∞ Infinity ERP</strong>
        <span>{c.branch_name}</span>
        <form action="/api/logout" method="post">
          <button>Chiqish</button>
        </form>
      </header>
      <main>
        <a href={"/erp?branch=" + branch + "&tab=contracts"}>
          ← Nasiya ro‘yxatiga
        </a>
        <h1>{c.customer_label}</h1>
        <p className="contractid">
          Shartnoma ID: <code>{c.id}</code>
          {c.number ? (
            <>
              {" · "}
              <a
                href={"/erp/contracts/" + c.id + "/shartnoma?branch=" + branch}
                target="_blank"
                rel="noopener"
              >
                {c.number} - sonli shartnomani chop etish
              </a>
            </>
          ) : null}
        </p>
        <aside className="notice">
          Excel va Kassa hisob-kitoblariga moslik auditdan o‘tmagan.
        </aside>
        <section className="detailsection">
          <h2>Qurilma va shartnoma</h2>
          <dl>
            <dt>Model</dt>
            <dd>{c.model}</dd>
            <dt>IMEI</dt>
            <dd>{c.imei}</dd>
            <dt>Boshlanish sanasi</dt>
            <dd>{dateOnly(c.start_date)}</dd>
            <dt>Muddat</dt>
            <dd>{c.months} oy</dd>
            {c.markup === null ? null : (
              <>
                <dt>Ustama</dt>
                <dd>
                  {money(c.markup)}
                  {Number(c.monthly_rate_bp)
                    ? ` (oyiga ${Number(c.monthly_rate_bp) / 100}%)`
                    : ""}
                </dd>
              </>
            )}
            <dt>Holat</dt>
            <dd>{Number(c.balance) > 0 ? "Qarzi bor" : "To‘liq to‘langan"}</dd>
          </dl>
        </section>
        <div className="cards">
          <section>
            <h2>Kelishilgan jami</h2>
            <strong>{money(c.total)}</strong>
          </section>
          <section>
            <h2>Boshlang‘ich to‘lov</h2>
            <strong>{money(c.down_payment)}</strong>
          </section>
          <section>
            <h2>Keyingi to‘lovlar</h2>
            <strong>
              {money(
                Number(c.total) - Number(c.down_payment) - Number(c.balance),
              )}
            </strong>
          </section>
          <section>
            <h2>Qolgan qarz</h2>
            <strong>{money(c.balance)}</strong>
          </section>
          {Number(c.advance) > 0 ? (
            <section>
              <h2>Mijoz avansi</h2>
              <strong>{money(c.advance)}</strong>
              <p>Qarzdan ortib tushgan pul; qarz hisobiga kirmaydi.</p>
            </section>
          ) : null}
        </div>
        <h2>Oylik jadval</h2>
        <table>
          <thead>
            <tr>
              <th>Oy</th>
              <th>To‘lov sanasi</th>
              <th>Rejadagi summa</th>
            </tr>
          </thead>
          <tbody>
            {detail.installments.map((i) => (
              <tr key={i.sequence}>
                <td>{i.sequence}</td>
                <td>{dateOnly(i.due_date)}</td>
                <td>{money(i.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Bu kelishilgan jadval. To‘lovlarni aniq oylarga taqsimlash hali
          qo‘shilmagan.
        </p>
        {can(detail.role, "payment.create") && Number(c.balance) > 0 ? (
          <>
            <h2>To‘lov kiritish</h2>
            <RecordForm
              branchId={branch}
              kind="payments"
              kurs={detail.kurs}
              selectedId={id}
              items={[
                { id, label: c.customer_label + " / " + money(c.balance) },
              ]}
            />
          </>
        ) : null}
        <h2>To‘lov tarixi</h2>
        <PaymentHistory
          history={history}
          branchId={branch}
          url={"/erp/contracts/" + id + "?branch=" + branch}
        />
      </main>
    </>
  );
}
