"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "../../lib/filters";
import { cashMoney, walletNames } from "../../lib/cash-domain";
import { can } from "../../lib/domain";
import type { readSuppliers } from "../../lib/supplier";

/**
 * Yetkazib beruvchilar va ularning qarzi (TZ SUP).
 *
 * Naqd xarid qarz yaratmaydi - "qarzga olingan" ustuni shuning uchun
 * jami xariddan kichik bo'ladi. Qarz to'lovi xarid xarajatini qayta
 * yaratmaydi, faqat majburiyatni kamaytiradi va kassadan pul chiqaradi.
 */
export function SuppliersPanel({
  branchId,
  report,
}: {
  branchId: string;
  report: Awaited<ReturnType<typeof readSuppliers>>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const canPay = can(report.role, "cash.entry");
  async function pay(supplierId: string, form: HTMLFormElement) {
    if (busy) return;
    setBusy(supplierId);
    setMessage("");
    const d = Object.fromEntries(new FormData(form)) as Record<string, string>;
    try {
      const r = await fetch("/api/suppliers/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId,
          supplierId,
          wallet: d.wallet,
          note: d.note,
          requestKey: crypto.randomUUID(),
          ...(d.wallet === "cash_usd"
            ? { usdAmount: d.usdAmount, rate: Number(d.rate) }
            : { amount: Number(d.amount) }),
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setMessage("To‘lov saqlandi");
      form.reset();
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ulanish xatosi");
    } finally {
      setBusy("");
    }
  }
  const jami = report.rows.reduce((n, r) => n + r.balance, 0);
  return (
    <>
      <div className="cards">
        <section>
          <h2>Yetkazib beruvchilar</h2>
          <strong>{report.rows.length}</strong>
        </section>
        <section>
          <h2>Jami qarzimiz</h2>
          <strong>{money(jami)}</strong>
          <p>Qarzga olingan tovar summasidan to‘langani ayrilgan.</p>
        </section>
      </div>
      <p role="status">{message}</p>
      <table>
        <thead>
          <tr>
            <th>Nomi</th>
            <th>Qurilma</th>
            <th>Jami xarid</th>
            <th>Qarzga olingan</th>
            <th>To‘langan</th>
            <th>Qoldiq qarz</th>
            {canPay ? <th>To‘lov</th> : null}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.id}>
              <td>
                {r.name}
                {r.phone ? <small>{r.phone}</small> : null}
              </td>
              <td>{r.devices}</td>
              <td>{money(r.purchased)}</td>
              <td>{money(r.obligations)}</td>
              <td>{money(r.settled)}</td>
              <td>
                <strong>{money(r.balance)}</strong>
              </td>
              {canPay ? (
                <td>
                  {r.balance > 0 ? (
                    <details>
                      <summary>Qarz to‘lash</summary>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          pay(r.id, e.currentTarget);
                        }}
                      >
                        <label>
                          Hamyon
                          <select name="wallet" defaultValue="cash_uzs">
                            {Object.entries(walletNames).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Summa UZS (so‘m hamyoni uchun)
                          <input name="amount" type="number" min={1} step={1} />
                        </label>
                        <label>
                          Dollar / kurs (USD hamyoni uchun)
                          <input
                            name="usdAmount"
                            inputMode="decimal"
                            pattern="\d{1,9}([.]\d{1,2})?"
                            placeholder="500.00"
                          />
                        </label>
                        <label>
                          Kurs
                          <input name="rate" type="number" min={1} step={1} />
                        </label>
                        <label>
                          Izoh
                          <input name="note" maxLength={160} />
                        </label>
                        <button disabled={busy === r.id}>
                          {busy === r.id ? "Saqlanmoqda…" : "To‘lash"}
                        </button>
                      </form>
                    </details>
                  ) : (
                    "—"
                  )}
                </td>
              ) : null}
            </tr>
          ))}
          {!report.rows.length ? (
            <tr>
              <td colSpan={canPay ? 7 : 6}>
                Yetkazib beruvchi yo‘q. Kirim kiritganda nomi yozilsa shu
                yerda paydo bo‘ladi.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p>
        Naqd olingan tovar qarz yaratmaydi. Qarz to‘lovi kassadan pul
        chiqaradi, xarid xarajatini qayta yaratmaydi. USD hamyonidan
        to‘langanda kurs saqlanadi.
      </p>
    </>
  );
}
