"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "../../lib/filters";
import { METRIC_NOMI, DONA, type Metric } from "../../lib/target-names";

type Qator = {
  metric: Metric;
  plan: number;
  fakt: number;
  foiz: number | null;
  qolgan: number | null;
  kunlik: number | null;
};

/**
 * Oylik reja: plan, fakt, foiz, qolgan va kunlik kerakli natija (TZ 6.9).
 *
 * Plan nol bo'lsa foiz hisoblanmaydi. Kunlik norma faqat davom etayotgan
 * oyda chiqadi - yopilgan oyga kelgusi kun normasi ma'nosiz.
 */
export function TargetForm({
  branchId,
  month,
  rows,
  qolganKun,
  canEdit,
}: {
  branchId: string;
  month: string;
  rows: Qator[];
  qolganKun: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const son = (m: Metric, v: number) =>
    DONA.includes(m) ? String(v) + " dona" : money(v);
  async function saqla(form: HTMLFormElement) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const d = Object.fromEntries(new FormData(form)) as Record<string, string>;
    try {
      const r = await fetch("/api/targets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId,
          month,
          values: Object.fromEntries(
            rows.map((x) => [x.metric, Number(d[x.metric] || 0)]),
          ),
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setMessage("Reja saqlandi");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ulanish xatosi");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>Oylik reja</h2>
      <p role="status">{message}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saqla(e.currentTarget);
        }}
      >
        <table>
          <thead>
            <tr>
              <th>Ko‘rsatkich</th>
              <th>Plan</th>
              <th>Fakt</th>
              <th>Bajarildi</th>
              <th>Qolgan</th>
              <th>Kunlik kerak</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.metric}>
                <td>{METRIC_NOMI[x.metric]}</td>
                <td>
                  {canEdit ? (
                    <input
                      name={x.metric}
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={x.plan || ""}
                      placeholder="0"
                    />
                  ) : x.plan ? (
                    son(x.metric, x.plan)
                  ) : (
                    "—"
                  )}
                </td>
                <td>{son(x.metric, x.fakt)}</td>
                <td>{x.foiz === null ? "—" : x.foiz + "%"}</td>
                <td>{x.qolgan === null ? "—" : son(x.metric, x.qolgan)}</td>
                <td>{x.kunlik === null ? "—" : son(x.metric, x.kunlik)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit ? (
          <button disabled={busy}>
            {busy ? "Saqlanmoqda…" : "Rejani saqlash"}
          </button>
        ) : null}
      </form>
      <p>
        {qolganKun
          ? `Oyning qolgan kuni: ${qolganKun}. "Kunlik kerak" — rejani bajarish uchun har kuni kerak bo‘ladigan natija.`
          : "Bu oy tugagan: kunlik norma hisoblanmaydi."}{" "}
        Plan nol bo‘lsa foiz hisoblanmaydi.
      </p>
    </>
  );
}
