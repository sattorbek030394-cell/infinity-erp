"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { readInvestors } from "../../lib/investor";
import {
  QOIDALAR,
  QOIDA_NOMI,
  YOZUV_NOMI,
} from "../../lib/investor-names";

/** Sentni dollar ko'rinishida: 105000 -> "1 050,00 $". */
const usd = (cents: number) =>
  (cents / 100).toLocaleString("uz-UZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " $";
const foiz = (ulush: number, jami: number) =>
  jami > 0 ? ((ulush / jami) * 100).toFixed(2) + "%" : "—";

type Data = Awaited<ReturnType<typeof readInvestors>>;

export function InvestorPanel({
  branchId,
  data,
}: {
  branchId: string;
  data: Data;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/investors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId, ...body }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMessage("Saqlandi");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ulanish xatosi");
    } finally {
      setBusy(false);
    }
  }
  const yubor = (e: React.FormEvent<HTMLFormElement>, action: string) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = Object.fromEntries(new FormData(form)) as Record<string, string>;
    void send({ action, ...d }).then(() => form.reset());
  };

  const jamiKapital = data.investorlar.reduce((a, b) => a + b.kapital, 0);
  const tanlanganOy = data.oylar.find((o) => o.oy === data.oy);

  return (
    <>
      <h1>Investorlar</h1>
      <div className="cards">
        <section>
          <h2>Jami kapital</h2>
          <strong>{usd(jamiKapital)}</strong>
          <p>{data.investorlar.filter((i) => !i.yopilgan).length} ta investor</p>
        </section>
        <section>
          <h2>Hisoblangan natija</h2>
          <strong>
            {usd(data.investorlar.reduce((a, b) => a + b.natija, 0))}
          </strong>
          <p>Kapitalga qo‘shilgan foyda va zarar ulushlari</p>
        </section>
        <section>
          <h2>Olingan pul</h2>
          <strong>{usd(data.investorlar.reduce((a, b) => a + b.olgan, 0))}</strong>
          <p>Qaytarilgan kapital va olingan daromad</p>
        </section>
      </div>

      <h2>Kapital holati</h2>
      <table>
        <thead>
          <tr>
            <th>Investor</th>
            <th>Kiritgan</th>
            <th>Natija ulushi</th>
            <th>Olgan</th>
            <th>Hozirgi kapital</th>
            <th>Ulushi</th>
            <th>{data.oy} kapital-kunlari</th>
          </tr>
        </thead>
        <tbody>
          {data.investorlar.map((i) => (
            <tr key={i.id}>
              <td>
                {i.name}
                <small>
                  {i.phone}
                  {i.yopilgan ? " · chiqib ketgan" : ""}
                </small>
              </td>
              <td>{usd(i.kiritgan)}</td>
              <td>{usd(i.natija)}</td>
              <td>{usd(i.olgan)}</td>
              <td>
                <strong>{usd(i.kapital)}</strong>
              </td>
              <td>{foiz(i.kapital, jamiKapital)}</td>
              <td>
                {(i.kunlar / 100).toLocaleString("uz-UZ", {
                  maximumFractionDigits: 0,
                })}
                <small>{foiz(i.kunlar, data.jamiKun)}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Kapital-kun — pulning qancha va qancha vaqt ishlagani: 10 000 $ 30
        kun va 20 000 $ 15 kun teng ulush oladi. Kirim kuni sanaladi, chiqim
        kuni sanalmaydi. Oxirgi ustun joriy oyning bugungacha yig‘ilgan
        kapital-kunlari — oy yopilganda taqsimot shu nisbatda chiqadi.
      </p>

      {data.ulushlar.length ? (
        <>
          <h2>
            {data.oy} taqsimoti
            {tanlanganOy ? ` — ${QOIDA_NOMI[tanlanganOy.rule]}` : ""}
          </h2>
          <table>
            <thead>
              <tr>
                <th>Investor</th>
                <th>Kapital-kunlar</th>
                <th>Ulushi</th>
                <th>Summa</th>
              </tr>
            </thead>
            <tbody>
              {data.ulushlar.map((u) => (
                <tr key={u.name}>
                  <td>{u.name}</td>
                  <td>
                    {(u.kunlar / 100).toLocaleString("uz-UZ", {
                      maximumFractionDigits: 0,
                    })}
                  </td>
                  <td>
                    {foiz(
                      u.kunlar,
                      data.ulushlar.reduce((a, b) => a + b.kunlar, 0),
                    )}
                  </td>
                  <td>
                    <strong>{usd(u.cents)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Bu oy yopilgan va raqamlari muzlatilgan — keyingi oylar uni
            qayta hisoblamaydi. Tuzatish kerak bo‘lsa, joriy oyda alohida
            yozuv bilan qilinadi.
          </p>
        </>
      ) : null}

      <h2>Yopilgan oylar</h2>
      {data.oylar.length ? (
        <nav className="branchbar">
          {data.oylar.map((o) => (
            <a
              key={o.oy}
              className={o.oy === data.oy ? "active" : ""}
              href={"/erp?branch=" + branchId + "&tab=investors&oy=" + o.oy}
            >
              {o.oy} · {usd(o.profit)}
            </a>
          ))}
        </nav>
      ) : (
        <p>Hali bir oy ham yopilmagan.</p>
      )}

      {data.canWrite ? (
        <>
          <h2>Yangi investor</h2>
          <form className="entry" onSubmit={(e) => yubor(e, "investor")}>
            <label>
              F.I.Sh.
              <input name="name" type="text" required maxLength={160} />
            </label>
            <label>
              Telefon
              <input name="phone" type="text" maxLength={40} />
            </label>
            <label>
              Izoh
              <input name="note" type="text" maxLength={200} />
            </label>
            <button disabled={busy}>Qo‘shish</button>
          </form>

          <h2>Kapital harakati</h2>
          <form className="entry" onSubmit={(e) => yubor(e, "entry")}>
            <label>
              Investor
              <select name="investorId" required>
                <option value="">Tanlang</option>
                {data.investorlar
                  .filter((i) => !i.yopilgan)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Turi
              <select name="kind" defaultValue="capital">
                <option value="capital">Kapital kiritildi</option>
                <option value="return">Kapital qaytarildi</option>
                <option value="payout">Daromad olindi</option>
              </select>
            </label>
            <label>
              Shakli
              <select name="form" defaultValue="cash">
                <option value="cash">Pul</option>
                <option value="goods">Tovar (tannarx bo‘yicha)</option>
              </select>
            </label>
            <label>
              Summa, $
              <input name="amount" type="number" required min={0.01} step={0.01} />
            </label>
            <label>
              Hamyon
              <select name="wallet" defaultValue="cash_usd">
                <option value="cash_usd">Naqd dollar</option>
                <option value="cash_uzs">Naqd so‘m</option>
                <option value="card_uzs">Karta (P2P)</option>
                <option value="bank_uzs">Hisob raqam</option>
              </select>
            </label>
            <label>
              Kurs (dollar bo‘lmasa)
              <input name="rate" type="number" min={1} step={1} />
            </label>
            <label>
              Sana
              <input name="day" type="date" required defaultValue={data.bugun} />
            </label>
            <label>
              Izoh
              <input name="note" type="text" maxLength={200} />
            </label>
            <button disabled={busy}>Saqlash</button>
            <p>
              Summa har doim dollarda yoziladi. Pul harakati kassaga ham
              tushadi — ikkinchi marta kiritish kerak emas; dollar
              bo‘lmasa kurs majburiy. Tovar ko‘rinishidagi kapital
              kassaga tegmaydi va uni Kirim bo‘limida “investor tovari”
              deb yozish qulayroq: o‘sha yerda tannarx bo‘yicha o‘zi
              hisobga tushadi. Qaytarim: 10 kun oldin yozma
              ogohlantirish, to‘lov oy yopilgandan keyin.
            </p>
          </form>

          <h2>Oyni yopish</h2>
          <form className="entry" onSubmit={(e) => yubor(e, "close")}>
            <label>
              Oy
              <input
                name="month"
                type="month"
                required
                defaultValue={data.oy}
              />
            </label>
            <label>
              Investorlarga tegishli natija, $
              <input name="profit" type="text" required placeholder="3112.36" />
            </label>
            <label>
              Oy kursi
              <input name="rate" type="number" required min={1} step={1} />
            </label>
            <label>
              Qoida
              <select name="rule" defaultValue="daily">
                {QOIDALAR.map((r) => (
                  <option key={r} value={r}>
                    {QOIDA_NOMI[r]}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy}>Yopish va taqsimlash</button>
            <p>
              Natija — sof foydaning investorlarga tegishli 80% i. Zarar
              bo‘lsa oldiga minus qo‘yiladi: zarar ham xuddi shu formulada
              taqsimlanadi va kapitaldan ayriladi. Yopilgan oy qayta
              hisoblanmaydi.
            </p>
          </form>
        </>
      ) : null}

      <h2>Kapital daftari</h2>
      <table>
        <thead>
          <tr>
            <th>Sana</th>
            <th>Investor</th>
            <th>Harakat</th>
            <th>Summa</th>
            <th>Izoh</th>
          </tr>
        </thead>
        <tbody>
          {data.daftar.map((e) => (
            <tr key={e.id}>
              <td>{e.day.split("-").reverse().join(".")}</td>
              <td>{e.name}</td>
              <td>
                {YOZUV_NOMI[e.kind] ?? e.kind}
                <small>
                  {e.form === "goods"
                    ? "tovar"
                    : e.form === "accrual"
                      ? "hisoblangan"
                      : "pul"}
                  {e.bekor ? " · bekor qilingan" : ""}
                </small>
              </td>
              <td>{e.bekor ? <s>{usd(e.cents)}</s> : usd(e.cents)}</td>
              <td>
                {e.note}
                {data.canWrite && !e.bekor && e.form !== "accrual" ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="textlink"
                      disabled={busy}
                      onClick={() => {
                        const reason = prompt("Bekor qilish sababi (5-160 belgi)");
                        if (reason)
                          void send({
                            action: "void",
                            entryId: e.id,
                            reason,
                          });
                      }}
                    >
                      bekor qilish
                    </button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {message ? <p className="notice">{message}</p> : null}
    </>
  );
}
