"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money, dateTime, methodNames } from "../../lib/filters";
import type { readPending } from "../../lib/payment-approval";

type Pending = Awaited<ReturnType<typeof readPending>>;

/**
 * Tasdiq kutayotgan tushumlar (PAY-06).
 *
 * Kassirga naqd, rahbarga P2P va bank tushumlari chiqadi. Tasdiqlanmagan
 * summa qarzni kamaytirmaydi va kassa qoldig'iga kirmaydi - ro'yxatdagi
 * "Qoldiq" shuning uchun to'lovdan oldingi qarzni ko'rsatadi.
 */
export function ApprovalsPanel({
  branchId,
  pending,
}: {
  branchId: string;
  pending: Pending;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  async function decide(
    paymentId: string,
    decision: "approve" | "reject",
    reason: string,
  ) {
    if (busy) return;
    setBusy(paymentId);
    setMessage("");
    try {
      const r = await fetch("/api/payments/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ branchId, paymentId, decision, reason }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setMessage(
        decision === "approve" ? "Tasdiqlandi" : "Rad etildi, sabab saqlandi",
      );
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ulanish xatosi");
    } finally {
      setBusy("");
    }
  }
  if (!pending.usullar.length)
    return (
      <p>
        Sizning rolingizda tushumni tasdiqlash huquqi yo‘q. Naqd pulni kassir,
        P2P va bank tushumini rahbar tasdiqlaydi.
      </p>
    );
  return (
    <>
      <aside className="notice">
        Skrinshotning o‘zi tasdiq emas: tasdiqlashdan oldin pulning haqiqatan
        kelganini tekshiring. Tasdiqlanmagan summa mijozning qarzini
        kamaytirmaydi va kassaga kirmaydi.
      </aside>
      <p role="status">{message}</p>
      {!pending.rows.length ? (
        <p>Tasdiq kutayotgan tushum yo‘q.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Kiritilgan</th>
              <th>Mijoz / qurilma</th>
              <th>Usul</th>
              <th>Summa</th>
              <th>Qarz (to‘lovdan oldin)</th>
              <th>Dalil</th>
              <th>Kirituvchi</th>
              <th>Qaror</th>
            </tr>
          </thead>
          <tbody>
            {pending.rows.map((p) => (
              <tr key={p.id}>
                <td>{dateTime(p.created_at)}</td>
                <td>
                  <a
                    href={
                      "/erp/contracts/" + p.contract_id + "?branch=" + branchId
                    }
                  >
                    {p.customer_label}
                  </a>
                  <br />
                  <small>
                    {p.model} / {p.imei}
                  </small>
                </td>
                <td>{methodNames[p.method] ?? p.method}</td>
                <td>{money(p.amount)}</td>
                <td>{money(p.balance)}</td>
                <td>{p.evidence || "—"}</td>
                <td>{p.author ?? "—"}</td>
                <td>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => decide(p.id, "approve", "")}
                  >
                    Tasdiqlash
                  </button>
                  <details>
                    <summary>Rad etish</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        decide(
                          p.id,
                          "reject",
                          String(new FormData(e.currentTarget).get("reason")),
                        );
                      }}
                    >
                      <label>
                        Sabab
                        <input
                          name="reason"
                          required
                          minLength={5}
                          maxLength={160}
                        />
                      </label>
                      <button disabled={busy === p.id}>Rad etish</button>
                    </form>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
