"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function RecordForm({
  branchId,
  kind,
  items,
  selectedId,
}: {
  branchId: string;
  kind: string;
  items: { id: string; label: string }[];
  selectedId?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef<string | null>(null);
  const lastPayload = useRef<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const payload = JSON.stringify(data);
    if (lastPayload.current !== payload) {
      key.current = crypto.randomUUID();
      lastPayload.current = payload;
    }
    if (kind === "payments") data.requestKey = key.current!;
    try {
      const response = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId, kind, data }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage("Saqlandi");
      form.reset();
      key.current = null;
      lastPayload.current = null;
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ulanish xatosi");
    } finally {
      setBusy(false);
    }
  }
  const field = (
    name: string,
    label: string,
    type = "text",
    min?: number,
    max?: number,
  ) => (
    <label key={name}>
      {label}
      <input
        name={name}
        type={type}
        required
        min={min}
        max={max}
        step={type === "number" ? 1 : undefined}
        maxLength={type === "text" ? 100 : undefined}
      />
    </label>
  );
  return (
    <form className="entry" onSubmit={submit}>
      {kind === "inventory" ? (
        <>
          {field("model", "Model")}
          {field("imei", "IMEI (15 raqam)")}
          {field("cost", "Tannarx UZS", "number", 1)}
        </>
      ) : null}
      {kind === "contracts" ? (
        <>
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
          {field("customerLabel", "Mijoz belgisi (maxfiy hujjatsiz)")}
          {field("total", "Kelishilgan jami UZS", "number", 1)}
          {field("downPayment", "Boshlang‘ich UZS", "number", 0)}
          <label>
            Boshlang‘ich to‘lov hamyoni
            <select name="downPaymentMethod">
              <option value="cash">Naqd UZS</option>
              <option value="card">Karta (P2P)</option>
              <option value="transfer">Hisob raqam</option>
            </select>
          </label>
          {field("months", "Oylar", "number", 1, 36)}
          {field("startDate", "Boshlanish sanasi", "date")}
        </>
      ) : null}
      {kind === "payments" ? (
        <>
          <label>
            Shartnoma
            <select name="contractId" required defaultValue={selectedId ?? ""}>
              <option value="">Tanlang</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
          {field("amount", "To‘lov UZS", "number", 1)}
          <label>
            Usul
            <select name="method">
              <option value="cash">Naqd</option>
              <option value="card">Karta</option>
              <option value="transfer">O‘tkazma</option>
            </select>
          </label>
        </>
      ) : null}
      <button disabled={busy}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
      <p role="status">{message}</p>
    </form>
  );
}
