"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function SaleForm({
  branch,
  items,
}: {
  branch: string;
  items: { id: string; label: string }[];
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    key = useRef(""),
    previous = useRef("");
  if (!items.length)
    return <p>Sotish uchun qurilma yo‘q. Avval Omborga qurilma qo‘shing.</p>;
  return (
    <form
      className="entry"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = e.currentTarget,
          data = Object.fromEntries(new FormData(form)),
          payload = JSON.stringify(data);
        if (previous.current !== payload) {
          key.current = crypto.randomUUID();
          previous.current = payload;
        }
        setBusy(true);
        setMessage("");
        try {
          const r = await fetch("/api/sales", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ...data,
              branchId: branch,
              requestKey: key.current,
            }),
          });
          const result = await r.json();
          if (!r.ok) throw new Error(result.error);
          setMessage("Savdo saqlandi. Tushum Kassaga yozildi.");
          key.current = "";
          previous.current = "";
          form.reset();
          router.refresh();
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Qurilma
        <select name="inventoryId" required>
          <option value="">Tanlang</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Sotuv summasi UZS
        <input
          name="amount"
          type="number"
          min={1}
          max={1000000000000}
          step={1}
          required
        />
      </label>
      <label>
        Tushum hamyoni
        <select name="method">
          <option value="cash">Naqd UZS</option>
          <option value="card">Karta (P2P)</option>
          <option value="transfer">Hisob raqam</option>
        </select>
      </label>
      <label>
        Mijoz belgisi (ixtiyoriy)
        <input
          name="customerLabel"
          maxLength={80}
          placeholder="Maxfiy hujjatsiz"
        />
      </label>
      <p>
        Summa to‘liq olingan bo‘lsin. Qurilma sotilgan deb belgilanadi. V1 da
        savdoni bekor qilish va qaytarish hali yo‘q.
      </p>
      <label>
        <input type="checkbox" required /> Qurilma va to‘liq tushumni
        tekshirdim.
      </label>
      <button disabled={busy}>
        {busy ? "Saqlanmoqda…" : "Sotish va Kassaga yozish"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
