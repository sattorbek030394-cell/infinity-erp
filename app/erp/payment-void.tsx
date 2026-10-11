"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function PaymentVoid({
  branchId,
  paymentId,
}: {
  branchId: string;
  paymentId: string;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [key, setKey] = useState("");
  return (
    <details>
      <summary>To‘lovni bekor qilish</summary>
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
            const r = await fetch("/api/payments/void", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ branchId, paymentId, requestKey, reason }),
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
          Mijozning qarzi to‘lov summasiga oshadi; Kassa tushumi asl sanada
          bekor qilinadi. Bu haqiqiy pul qaytarilishi emas, xato yozuvni
          tuzatish. To‘g‘ri to‘lovni keyin yangi yozuv sifatida kiriting.
        </p>
        <label>
          Sabab
          <input name="reason" required minLength={5} maxLength={160} />
        </label>
        <label>
          <input type="checkbox" required /> Bu xato yozuv ekanini tekshirdim.
        </label>
        <button disabled={busy}>
          {busy ? "Kutilmoqda…" : "To‘lovni bekor qilish"}
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </details>
  );
}
