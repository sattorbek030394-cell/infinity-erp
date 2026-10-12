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
  // Qarzga sotishda sotuvchi raqam kiritayotganda qolgan qarz darhol
  // ko'rinadi - mijozga aytiladigan summa shu.
  const [qarz, setQarz] = useState<{
    narx: number;
    tushdi: number;
    qoldiqUsd: number;
    qoldiqSom: number;
  } | null>(null);
  function hisobla(form: HTMLFormElement) {
    const d = Object.fromEntries(new FormData(form)) as Record<string, string>;
    // USD summasi va kurs berilsa so'mdagi qiymat darhol ko'rinadi.
    if (kind === "payments" || kind === "inventory") {
      const usd = Number(kind === "payments" ? d.usdAmount : d.costUsd),
        kurs = Number(kind === "payments" ? d.rate : d.costRate);
      setSom(usd > 0 && kurs > 0 ? Math.round(usd * kurs) : 0);
      return;
    }
    if (kind === "qarz") {
      const kurs = Number(d.rate || 0),
        narxUsd = Number(d.priceUsd || 0);
      const tushdiUsd =
        Number(d.tolUsd || 0) +
        (kurs > 0
          ? (Number(d.tolSom || 0) +
              Number(d.tolKarta || 0) +
              Number(d.tolBank || 0)) /
            kurs
          : 0);
      setQarz(
        kurs > 0 && narxUsd > 0
          ? {
              narx: Math.round(narxUsd * kurs),
              tushdi: Math.round(tushdiUsd * kurs),
              qoldiqUsd: narxUsd - tushdiUsd,
              qoldiqSom: Math.round((narxUsd - tushdiUsd) * kurs),
            }
          : null,
      );
      return;
    }
    if (kind !== "contracts") return;
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
    // Qarzga sotishda mijoz bir necha hamyonga bo'lib to'laydi; forma
    // tekis maydonlardan ro'yxat yasaydi. USD dollarda kiritiladi,
    // bazaga sent bo'lib ketadi.
    let body: Record<string, unknown> = data;
    if (kind === "qarz") {
      const tolovlar: { method: string; amount: number }[] = [];
      const qosh = (method: string, amount: number) => {
        if (amount > 0) tolovlar.push({ method, amount: Math.round(amount) });
      };
      qosh("cash_usd", Number(data.tolUsd || 0) * 100);
      qosh("cash", Number(data.tolSom || 0));
      qosh("card", Number(data.tolKarta || 0));
      qosh("transfer", Number(data.tolBank || 0));
      const qolgani: Record<string, string> = { ...data };
      for (const k of ["tolUsd", "tolSom", "tolKarta", "tolBank"])
        delete qolgani[k];
      body = { ...qolgani, tolovlar };
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
        body: JSON.stringify({ branchId, kind, data: body }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage("Saqlandi");
      form.reset();
      setHisob(null);
      setQarz(null);
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
          {ixtiyoriy("brand", "Brend")}
          {field("model", "Model")}
          {field("imei", "IMEI yoki seriya raqami")}
          {ixtiyoriy("imei2", "IMEI 2")}
          {ixtiyoriy("memory", "Xotira")}
          {ixtiyoriy("simType", "SIM turi")}
          {ixtiyoriy("color", "Rang")}
          {ixtiyoriy("region", "Region")}
          <label>
            Qurilma holati
            <select name="condition" defaultValue="">
              <option value="">—</option>
              <option value="Yangi">Yangi</option>
              <option value="B/U">B/U</option>
              <option value="Trade-in">Trade-in</option>
            </select>
          </label>
          {ixtiyoriy("battery", "Batareyka %", "number")}
          {ixtiyoriy("purchaseDate", "Kirim sanasi", "date")}
          {ixtiyoriy("costUsd", "Tannarx USD")}
          <label>
            Kirim kursi (1 USD = so‘m)
            <input
              name="costRate"
              type="number"
              min={1}
              step={1}
              defaultValue={kurs || undefined}
            />
          </label>
          {ixtiyoriy("cost", "Yoki tannarx UZS", "number")}
          {ixtiyoriy("expectedPrice", "Prognoz sotuv narxi UZS", "number")}
          {ixtiyoriy("supplier", "Yetkazib beruvchi")}
          {ixtiyoriy("receivedBy", "Qabul qiluvchi")}
          <label>
            To‘lov turi
            <select name="purchaseMethod" defaultValue="">
              <option value="">—</option>
              <option value="cash_uzs">Naqd UZS</option>
              <option value="cash_usd">Naqd USD</option>
              <option value="card">Karta</option>
              <option value="bank">Hisob raqam</option>
              <option value="debt">Qarzga</option>
              <option value="investor">Investor tovari</option>
            </select>
          </label>
          {som ? (
            <p className="hisob">
              Tannarx so‘mda: <strong>{money(som)}</strong>
            </p>
          ) : null}
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
          {ixtiyoriy("seller", "Sotuvchi")}
          <label>
            Sotuv kanali
            <select name="channel" defaultValue="">
              <option value="">—</option>
              <option value="Bozor">Bozor</option>
              <option value="Instagram">Instagram</option>
              <option value="Telegram">Telegram</option>
              <option value="Eski mijoz">Eski mijoz</option>
              <option value="Tavsiya">Tavsiya</option>
              <option value="Boshqa">Boshqa</option>
            </select>
          </label>
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
      {kind === "qarz" ? (
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
          {ixtiyoriy("phone1", "Telefon 1")}
          {ixtiyoriy("phone2", "Telefon 2")}
          {ixtiyoriy("address", "Manzil")}
          <label>
            Fakt sotish narxi, $
            <input
              name="priceUsd"
              type="number"
              required
              min={1}
              step={0.01}
            />
          </label>
          <label>
            Sotuv kursi
            <input
              name="rate"
              type="number"
              required
              min={1}
              step={1}
              defaultValue={kurs || undefined}
            />
          </label>
          <label>
            Naqd dollar, $
            <input name="tolUsd" type="number" min={0} step={0.01} />
          </label>
          {ixtiyoriy("tolSom", "Naqd so‘m", "number")}
          {ixtiyoriy("tolKarta", "Karta (P2P), so‘m", "number")}
          {ixtiyoriy("tolBank", "Hisob raqam, so‘m", "number")}
          {field("dueDate", "Qarz muddati", "date")}
          {ixtiyoriy("seller", "Sotuvchi")}
          {ixtiyoriy("limitOverrideReason", "Limitdan oshsa: rahbar sababi")}
          {qarz ? (
            <p className="hisob">
              Sotish narxi <strong>{money(qarz.narx)}</strong> · Tushdi{" "}
              <strong>{money(qarz.tushdi)}</strong> · Qolgan qarz{" "}
              <strong>{qarz.qoldiqUsd.toFixed(2)} $</strong> ={" "}
              <strong>{money(qarz.qoldiqSom)}</strong>
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
