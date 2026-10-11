"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { nasiyaTotals } from "../../lib/domain";
import { money } from "../../lib/filters";
export function RecordForm({
  branchId,
  kind,
  items,
  selectedId,
  kurs = "",
}: {
  branchId: string;
  kind: string;
  items: { id: string; label: string }[];
  selectedId?: string;
  kurs?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // Sotuvchi raqamni kiritayotganda ustama va oylik to'lov darhol ko'rinadi:
  // mijozga aytiladigan summa shu, qo'lda hisoblash kerak emas.
  const [hisob, setHisob] = useState<ReturnType<typeof nasiyaTotals> | null>(
    null,
  );
  // To'lov usuli: USD tanlansa dollar va kurs so'raladi, so'm summasini
  // dastur hisoblaydi (PAY-02).
  const [usul, setUsul] = useState("cash");
  const [som, setSom] = useState(0);
  function hisobla(form: HTMLFormElement) {
    if (kind !== "contracts" && kind !== "payments") return;
    const d = Object.fromEntries(new FormData(form)) as Record<string, string>;
    if (kind === "payments") {
      const usd = Number(d.usdAmount),
        kurs = Number(d.rate);
      setSom(usd > 0 && kurs > 0 ? Math.round(usd * kurs) : 0);
      return;
    }
    try {
      setHisob(
        nasiyaTotals(
          Number(d.priceUzs),
          Number(d.downPayment || 0),
          Number(d.months),
          Math.round(Number(d.rateFoiz || 0) * 100),
        ),
      );
    } catch {
      setHisob(null);
    }
  }
  const key = useRef<string | null>(null);
  const lastPayload = useRef<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<
      string,
      string
    >;
    // Ekranda foiz, bazada bazis punkt: 5% -> 500.
    if (kind === "contracts") {
      data.monthlyRateBp = String(Math.round(Number(data.rateFoiz || 0) * 100));
      delete data.rateFoiz;
    }
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
      setHisob(null);
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
    required = true,
  ) => (
    <label key={name}>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        min={min}
        max={max}
        step={type === "number" ? 1 : undefined}
        maxLength={type === "text" ? 100 : undefined}
      />
    </label>
  );
  const ixtiyoriy = (name: string, label: string, type = "text") =>
    field(name, label, type, undefined, undefined, false);
  return (
    <form
      className="entry"
      onSubmit={submit}
      onInput={(e) => hisobla(e.currentTarget)}
    >
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
          {field("customerName", "Mijoz F.I.Sh.")}
          {ixtiyoriy("pnfl", "PNFL (JShShIR)")}
          {ixtiyoriy("passport", "Pasport seriyasi")}
          {ixtiyoriy("passportIssuer", "Pasportni kim berdi")}
          {ixtiyoriy("passportDate", "Pasport sanasi", "date")}
          {ixtiyoriy("birthDate", "Tug‘ilgan sana", "date")}
          {ixtiyoriy("phone1", "Telefon 1")}
          {ixtiyoriy("phone2", "Telefon 2")}
          {ixtiyoriy("address", "Manzil")}
          {ixtiyoriy("icloudAccount", "iCloud akkaunt")}
          {ixtiyoriy("icloudPhone", "iCloud raqami")}
          {field("priceUzs", "Qurilma narxi UZS", "number", 1)}
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
          <label>
            Oylik ustama %
            <input
              name="rateFoiz"
              type="number"
              required
              min={0}
              max={100}
              step={0.1}
              defaultValue={5}
            />
          </label>
          {field("startDate", "Boshlanish sanasi", "date")}
          {ixtiyoriy(
            "limitOverrideReason",
            "Limitdan oshsa: rahbar sababi",
          )}
          {hisob ? (
            <p className="hisob">
              Asosiy qarz <strong>{money(hisob.principal)}</strong> · Ustama{" "}
              <strong>{money(hisob.markup)}</strong> · Jami{" "}
              <strong>{money(hisob.total)}</strong> · Oylik to‘lov{" "}
              <strong>{money(hisob.monthly)}</strong>
            </p>
          ) : null}
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
          <label>
            Usul
            <select
              name="method"
              value={usul}
              onChange={(e) => setUsul(e.target.value)}
            >
              <option value="cash">Naqd UZS</option>
              <option value="cash_usd">Naqd USD</option>
              <option value="card">Karta (P2P)</option>
              <option value="transfer">Hisob raqam</option>
            </select>
          </label>
          {usul === "cash_usd" ? (
            <>
              <label>
                Olingan dollar
                <input
                  name="usdAmount"
                  required
                  inputMode="decimal"
                  pattern="\d{1,9}([.]\d{1,2})?"
                  placeholder="100.50"
                />
              </label>
              <label>
                To‘lov kursi (1 USD = so‘m)
                <input
                  name="rate"
                  type="number"
                  required
                  min={1}
                  step={1}
                  defaultValue={kurs || undefined}
                />
              </label>
              {som ? (
                <p className="hisob">
                  Qarzga yo‘naltiriladi: <strong>{money(som)}</strong>
                </p>
              ) : null}
            </>
          ) : (
            field("amount", "To‘lov UZS", "number", 1)
          )}
          {ixtiyoriy("evidence", "Tranzaksiya raqami / dalil")}
        </>
      ) : null}
      <button disabled={busy}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
      <p role="status">{message}</p>
    </form>
  );
}
