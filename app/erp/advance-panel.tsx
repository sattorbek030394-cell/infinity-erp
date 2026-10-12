"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "../../lib/filters";
import type { readAdvances } from "../../lib/advance";

/**
 * Ishlatilmagan avanslar va ularni mijozning boshqa shartnomasiga
 * ko'chirish. Kassaga yozuv tushmaydi - pul allaqachon kirgan.
 */
export function AdvancePanel({
  branchId,
  rows,
  canMove,
}: {
  branchId: string;
  rows: Awaited<ReturnType<typeof readAdvances>>;
  canMove: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent<HTMLFormElement>, advanceId: string) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const form = e.currentTarget;
    const d = Object.fromEntries(new FormData(form)) as Record<string, string>;
    try {
      const r = await fetch("/api/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId, advanceId, ...d }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMessage("Ko‘chirildi");
      form.reset();
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ulanish xatosi");
    } finally {
      setBusy(false);
    }
  }

  if (!rows.length)
    return (
      <>
        <h2>Mijoz avanslari</h2>
        <p>Ishlatilmagan avans yo‘q.</p>
      </>
    );
  return (
    <>
      <h2>Mijoz avanslari</h2>
      <p>
        Mijoz qarzdan ortiq to‘lagan pul. Uni o‘sha mijozning boshqa
        shartnomasiga ko‘chirish mumkin — kassaga yozuv tushmaydi, chunki pul
        avans paydo bo‘lgan kuni allaqachon kirgan.
      </p>
      {rows.map((a) => (
        <section key={a.id} className="detailsection">
          <h2>
            №{a.number} {a.nom} — {money(a.qoldiq)}
          </h2>
          <p>
            {a.kun.split("-").reverse().join(".")} dan ishlatilmagan avans.
          </p>
          {!canMove ? (
            <p className="notice">Ko‘chirish rahbar va administratorda.</p>
          ) : a.nishonlar.length ? (
            <form className="entry" onSubmit={(e) => send(e, a.id)}>
              <label>
                Qaysi shartnomaga
                <select name="toContractId" required>
                  <option value="">Tanlang</option>
                  {a.nishonlar.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Summa
                <input
                  name="amount"
                  type="number"
                  required
                  min={1}
                  max={a.qoldiq}
                  step={1}
                  defaultValue={Math.min(
                    a.qoldiq,
                    Math.max(...a.nishonlar.map((n) => n.qarz)),
                  )}
                />
              </label>
              <label>
                Sababi
                <input name="reason" type="text" required maxLength={160} />
              </label>
              <button disabled={busy}>Ko‘chirish</button>
            </form>
          ) : (
            <p>
              Bu mijozning qarzi bor boshqa shartnomasi yo‘q — ko‘chirish
              joyi topilmadi.
            </p>
          )}
        </section>
      ))}
      {message ? <p className="notice">{message}</p> : null}
    </>
  );
}
