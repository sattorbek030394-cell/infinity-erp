"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money, dateTime } from "../../lib/filters";

type Mijoz = {
  id: string;
  full_name: string;
  pnfl: string | null;
  passport: string | null;
  phone1: string;
  phone2: string;
  address: string;
  icloud_account: string;
  blocked_at: string | null;
  blocked_reason: string | null;
  blocked_email: string | null;
  contracts: string;
  exposure: string;
};

/**
 * Mijoz kartochkasi va qora ro'yxat (taklif 3.1).
 *
 * Qora ro'yxatdagi mijozga yangi nasiya berilmaydi; eski shartnomalari
 * o'z holicha qoladi.
 */
export function CustomerPanel({
  branchId,
  mijoz,
  canBlock,
}: {
  branchId: string;
  mijoz: Mijoz;
  canBlock: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function yubor(action: "block" | "unblock", reason: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/customers/block", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId,
          customerId: mijoz.id,
          action,
          reason,
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ulanish xatosi");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="detailsection">
      <h2>Mijoz</h2>
      {mijoz.blocked_at ? (
        <aside className="notice">
          <strong>Qora ro‘yxatda.</strong> Sabab: {mijoz.blocked_reason}.{" "}
          {dateTime(mijoz.blocked_at)}
          {mijoz.blocked_email ? ` • ${mijoz.blocked_email}` : ""}. Bu mijozga
          yangi nasiya berilmaydi.
        </aside>
      ) : null}
      <dl>
        <dt>F.I.Sh.</dt>
        <dd>{mijoz.full_name}</dd>
        <dt>Telefon</dt>
        <dd>{[mijoz.phone1, mijoz.phone2].filter(Boolean).join(" • ") || "—"}</dd>
        <dt>PNFL / pasport</dt>
        <dd>{[mijoz.pnfl, mijoz.passport].filter(Boolean).join(" • ") || "—"}</dd>
        <dt>Manzil</dt>
        <dd>{mijoz.address || "—"}</dd>
        <dt>iCloud</dt>
        <dd>{mijoz.icloud_account || "—"}</dd>
        <dt>Shartnomalari</dt>
        <dd>
          {mijoz.contracts} ta • jami qarzi {money(mijoz.exposure)}
        </dd>
      </dl>
      {canBlock ? (
        mijoz.blocked_at ? (
          <button disabled={busy} onClick={() => yubor("unblock", "")}>
            Qora ro‘yxatdan chiqarish
          </button>
        ) : (
          <details>
            <summary>Qora ro‘yxatga qo‘shish</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                yubor(
                  "block",
                  String(new FormData(e.currentTarget).get("reason")),
                );
              }}
            >
              <label>
                Sabab
                <input name="reason" required minLength={5} maxLength={160} />
              </label>
              <button disabled={busy}>Qo‘shish</button>
            </form>
          </details>
        )
      ) : null}
      {message ? <p role="alert">{message}</p> : null}
    </section>
  );
}
