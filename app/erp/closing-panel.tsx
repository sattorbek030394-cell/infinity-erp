"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cashMoney, walletNames, type Wallet } from "../../lib/cash-domain";
import { dateOnly, dateTime } from "../../lib/filters";
import type { readClosings } from "../../lib/cash-closing";

const WALLETS = Object.keys(walletNames) as Wallet[];

/**
 * Kun yopish (CASH-04).
 *
 * Kassir har hamyonni sanaydi; dastur hisoblagan qoldiq bilan farqi
 * ko'rinadi. Yopilgan kunga yangi yozuv kirmaydi - nasiya to'lovi ham.
 */
export function ClosingPanel({
  branchId,
  report,
  today,
  balances,
}: {
  branchId: string;
  report: Awaited<ReturnType<typeof readClosings>>;
  today: string;
  balances: { wallet: string; balance: string | null }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function yubor(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/cash/close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ branchId, ...body }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setMessage(body.action === "reopen" ? "Kun qayta ochildi" : "Kun yopildi");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ulanish xatosi");
    } finally {
      setBusy(false);
    }
  }
  const hisob = (wallet: string) =>
    balances.find((b) => b.wallet === wallet)?.balance ?? null;
  return (
    <section className="detailsection">
      <h2>Kun yopish</h2>
      <p role="status">{message}</p>
      {report.canClose ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const d = Object.fromEntries(
              new FormData(e.currentTarget),
            ) as Record<string, string>;
            yubor({
              day: d.day,
              note: d.note,
              counted: {
                cash_uzs: d.cash_uzs,
                cash_usd: d.cash_usd,
                card_uzs: d.card_uzs,
                bank_uzs: d.bank_uzs,
              },
            });
          }}
        >
          <div className="entry">
            <label>
              Kun
              <input name="day" type="date" required defaultValue={today} />
            </label>
            {WALLETS.map((w) => (
              <label key={w}>
                {walletNames[w]} — sanalgan
                <input
                  name={w}
                  required
                  inputMode="decimal"
                  pattern="\d{1,12}([.]\d{1,2})?"
                  placeholder={
                    hisob(w) !== null
                      ? cashMoney(hisob(w), w).replace(/[^\d.]/g, "")
                      : "0"
                  }
                />
              </label>
            ))}
            <label>
              Izoh
              <input name="note" maxLength={160} />
            </label>
            <button disabled={busy}>{busy ? "Yopilmoqda…" : "Kunni yopish"}</button>
          </div>
          <p>
            Dastur hisoblagan qoldiq: {" "}
            {WALLETS.map((w) =>
              hisob(w) !== null
                ? `${walletNames[w]} ${cashMoney(hisob(w), w)}`
                : `${walletNames[w]} — boshlang‘ich qoldiq belgilanmagan`,
            ).join(" • ")}
          </p>
        </form>
      ) : null}
      {report.rows.length ? (
        <table>
          <thead>
            <tr>
              <th>Kun</th>
              <th>Hisoblangan / sanalgan</th>
              <th>Farq</th>
              <th>Izoh</th>
              <th>Yopgan</th>
              <th>Holat</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.id}>
                <td>{dateOnly(r.day)}</td>
                <td>
                  {(r.lines ?? []).map(
                    (l: {
                      wallet: string;
                      computed: string;
                      counted: string;
                    }) => (
                      <small key={l.wallet}>
                        {walletNames[l.wallet as Wallet]}:{" "}
                        {cashMoney(l.computed, l.wallet as Wallet)} /{" "}
                        {cashMoney(l.counted, l.wallet as Wallet)}
                      </small>
                    ),
                  )}
                </td>
                <td>
                  {(r.lines ?? [])
                    .filter(
                      (l: { computed: string; counted: string }) =>
                        BigInt(l.counted) !== BigInt(l.computed),
                    )
                    .map(
                      (l: {
                        wallet: string;
                        computed: string;
                        counted: string;
                      }) => (
                        <small key={l.wallet}>
                          {walletNames[l.wallet as Wallet]}:{" "}
                          {cashMoney(
                            String(BigInt(l.counted) - BigInt(l.computed)),
                            l.wallet as Wallet,
                          )}
                        </small>
                      ),
                    )}
                </td>
                <td>{r.note || "—"}</td>
                <td>
                  {r.closed_email ?? "—"}
                  <small>{dateTime(r.closed_at)}</small>
                </td>
                <td>
                  {r.reopened_at ? (
                    <>
                      Qayta ochilgan
                      <small>{r.reopen_reason}</small>
                      <small>
                        {r.reopened_email} • {dateTime(r.reopened_at)}
                      </small>
                    </>
                  ) : report.canReopen ? (
                    <details>
                      <summary>Qayta ochish</summary>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          yubor({
                            action: "reopen",
                            day: String(r.day).slice(0, 10),
                            reason: String(
                              new FormData(e.currentTarget).get("reason"),
                            ),
                          });
                        }}
                      >
                        <label>
                          Sabab
                          <input
                            name="reason"
                            required
                            minLength={5}
                            maxLength={160}
                          />
                        </label>
                        <button disabled={busy}>Qayta ochish</button>
                      </form>
                    </details>
                  ) : (
                    "Yopilgan"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
