"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money, dateOnly } from "../../lib/filters";

type Quote = {
  id: string;
  kind: string;
  quote_date: string;
  periods_elapsed: number;
  debt_before: string;
  markup_kept: string;
  markup_cancelled: string;
  close_amount: string;
  decided_at?: string;
};

/**
 * Shartnomani to'liq yopish (PAY-07).
 *
 * Avval hisob olinadi: ekranda joriy qarz, saqlanadigan ustama, bekor
 * qilinadigan ustama va yakuniy yopish summasi ko'rinadi. Mijoz shu
 * summani to'laydi (odatdagi to'lov ekrani orqali, tasdiq tartibi bilan),
 * keyin "Yopishni yakunlash" bosiladi.
 */
export function ClosurePanel({
  branchId,
  contractId,
  quote,
  done,
}: {
  branchId: string;
  contractId: string;
  quote: Quote | null;
  done: Quote | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function yubor(action: "quote" | "complete" | "cancel") {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/closures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ branchId, contractId, action }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setMessage(
        action === "complete"
          ? "Shartnoma yopildi"
          : action === "cancel"
            ? "Hisob bekor qilindi"
            : "Hisob tayyor",
      );
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ulanish xatosi");
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <section className="detailsection">
        <h2>Shartnoma yopilgan</h2>
        <dl>
          <dt>Yopilish turi</dt>
          <dd>
            {done.kind === "early" ? "Muddatidan oldin" : "Jadval bo‘yicha"}
          </dd>
          <dt>Yopilgan sana</dt>
          <dd>{done.decided_at ? dateOnly(done.decided_at) : "—"}</dd>
          <dt>Bekor qilingan kelgusi ustama</dt>
          <dd>{money(done.markup_cancelled)}</dd>
          <dt>Yakuniy yopish summasi</dt>
          <dd>{money(done.close_amount)}</dd>
        </dl>
      </section>
    );
  return (
    <section className="detailsection">
      <h2>Shartnomani to‘liq yopish</h2>
      {!quote ? (
        <>
          <p>
            Mijoz qarzni bir yo‘la yopmoqchi bo‘lsa, avval hisob oling:
            muddatidan oldin yopishda kelgusi oylarning to‘lanmagan ustamasi
            avtomatik olib tashlanadi.
          </p>
          <button disabled={busy} onClick={() => yubor("quote")}>
            {busy ? "Hisoblanmoqda…" : "Yopish hisobini olish"}
          </button>
        </>
      ) : (
        <>
          <dl>
            <dt>Hisob sanasi</dt>
            <dd>{dateOnly(quote.quote_date)} (shu kun uchun amal qiladi)</dd>
            <dt>O‘tgan to‘liq oylar</dt>
            <dd>{quote.periods_elapsed}</dd>
            <dt>Joriy qarz</dt>
            <dd>{money(quote.debt_before)}</dd>
            <dt>Saqlanadigan ustama</dt>
            <dd>{money(quote.markup_kept)}</dd>
            <dt>Avtomatik olib tashlanadigan ustama</dt>
            <dd>{money(quote.markup_cancelled)}</dd>
            <dt>Yakuniy yopish summasi</dt>
            <dd>
              <strong>{money(quote.close_amount)}</strong>
            </dd>
          </dl>
          <p>
            Shu summani odatdagi to‘lov ekrani orqali qabul qiling (naqdni
            kassir, P2P va bankni rahbar tasdiqlaydi), keyin yopishni
            yakunlang. Tasdiqlanmagan tushum bilan shartnoma yopilmaydi.
          </p>
          <button disabled={busy} onClick={() => yubor("complete")}>
            {busy ? "Kutilmoqda…" : "Yopishni yakunlash"}
          </button>{" "}
          <button disabled={busy} onClick={() => yubor("quote")}>
            Qayta hisoblash
          </button>{" "}
          <button disabled={busy} onClick={() => yubor("cancel")}>
            Hisobni bekor qilish
          </button>
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
