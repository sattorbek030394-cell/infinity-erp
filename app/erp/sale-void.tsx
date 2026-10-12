"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function SaleVoid({
  branchId,
  saleId,
}: {
  branchId: string;
  saleId: string;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [key, setKey] = useState("");
  return (
    <details>
      <summary>Savdoni bekor qilish</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const reason = String(new FormData(e.currentTarget).get("reason")),
            requestKey = key || crypto.randomUUID();
          setKey(requestKey);
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/sales/void", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ branchId, saleId, requestKey, reason }),
            });
            const result = await r.json();
            if (!r.ok) {
              setKey("");
              throw new Error(result.error);
            }
            setKey("");
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          Xato savdo yozuvi bekor qilinadi, qurilma Omborga qaytadi va Kassa
          tushumi asl sanada tuzatiladi. Asl yozuv saqlanadi. Haqiqiy pul
          qaytarilishi bu amal orqali bajarilmaydi.
        </p>
        <label>
          Sabab
          <input name="reason" required minLength={5} maxLength={160} />
        </label>
        <label>
          <input type="checkbox" required /> Bu xato savdo ekanini va qurilma
          omborda ekanini tekshirdim.
        </label>
        <button disabled={busy}>
          {busy ? "Kutilmoqda…" : "Xato savdoni bekor qilish"}
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </details>
  );
}
