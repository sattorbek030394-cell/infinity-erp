"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function CashReverse({
  branch,
  entryId,
}: {
  branch: string;
  entryId: string;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [key, setKey] = useState("");
  return (
    <details>
      <summary>Bekor qilish</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const reason = String(new FormData(e.currentTarget).get("reason"));
          const requestKey = key || crypto.randomUUID();
          setKey(requestKey);
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/cash/reverse", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                branchId: branch,
                entryId,
                requestKey,
                reason,
              }),
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
          Asl yozuv saqlanadi, uning sanasiga qarama-qarshi yozuv qo‘shiladi.
          O‘tkazmaning ikkala tomoni birga bekor qilinadi.
        </p>
        <label>
          Sabab
          <input name="reason" required minLength={5} maxLength={160} />
        </label>
        <button disabled={busy}>
          {busy ? "Kutilmoqda…" : "Harakatni bekor qilish"}
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </details>
  );
}
