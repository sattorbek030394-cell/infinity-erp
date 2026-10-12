"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { dateTime, money } from "../../lib/filters";
import { HOLAT_NOMI, QAROR_NOMI } from "../../lib/control-names";

type Qaror = {
  id: string;
  action: string;
  reason: string;
  days_late: number | null;
  debt: string | null;
  created_at: string;
  author: string | null;
};

/**
 * Qurilma nazorati: iCloud/MDM holati va bloklash hujjati (taklif 3.2).
 *
 * Har qaror kim, qachon, nega va qanday kechikishda qabul qilganini
 * saqlaydi. Shartnoma yopilganda nazoratni ochish majburiyati bor.
 */
export function ControlPanel({
  branchId,
  contractId,
  state,
  history,
  canControl,
  debtLeft,
}: {
  branchId: string;
  contractId: string;
  state: string;
  history: Qaror[];
  canControl: boolean;
  debtLeft: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function yubor(action: string, reason = "") {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/devices/control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ branchId, contractId, action, reason }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ulanish xatosi");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="detailsection">
      <h2>Qurilma nazorati</h2>
      <p>
        Holat: <strong>{HOLAT_NOMI[state] ?? state}</strong>
        {state === "blocked" ? " — qurilma bloklangan" : null}
      </p>
      {!debtLeft && (state === "installed" || state === "blocked") ? (
        <aside className="notice">
          Qarz yopilgan, lekin qurilma hali nazoratda. Mijozga qaytarish
          majburiyati bajarilmagan — nazoratdan chiqaring.
        </aside>
      ) : null}
      {canControl ? (
        <>
          {state === "none" || state === "released" ? (
            <button disabled={busy} onClick={() => yubor("install")}>
              Nazoratga olindi
            </button>
          ) : null}
          {state === "installed" ? (
            <details>
              <summary>Bloklash</summary>
              <p>
                Bloklash huquqi shartnoma matnida yozilgan bo‘lishi kerak.
                Sabab mijozga aytiladigan darajada aniq bo‘lsin.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  yubor(
                    "block",
                    String(new FormData(e.currentTarget).get("reason")),
                  );
                }}
              >
                <label>
                  Sabab
                  <input name="reason" required minLength={5} maxLength={160} />
                </label>
                <button disabled={busy}>Bloklash</button>
              </form>
            </details>
          ) : null}
          {state === "blocked" ? (
            <button disabled={busy} onClick={() => yubor("unblock")}>
              Ochish
            </button>
          ) : null}
          {state === "installed" || state === "blocked" ? (
            <>
              {" "}
              <button disabled={busy} onClick={() => yubor("release")}>
                Nazoratdan chiqarish
              </button>
            </>
          ) : null}
        </>
      ) : null}
      {message ? <p role="alert">{message}</p> : null}
      {history.length ? (
        <table>
          <thead>
            <tr>
              <th>Vaqt</th>
              <th>Qaror</th>
              <th>Sabab</th>
              <th>Kechikish / qarz</th>
              <th>Kim</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td>{dateTime(h.created_at)}</td>
                <td>{QAROR_NOMI[h.action] ?? h.action}</td>
                <td>{h.reason || "—"}</td>
                <td>
                  {h.days_late !== null ? h.days_late + " kun" : "—"}
                  {h.debt !== null ? " / " + money(h.debt) : ""}
                </td>
                <td>{h.author ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
