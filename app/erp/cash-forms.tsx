"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  walletNames,
  cashCategories,
  type Wallet,
} from "../../lib/cash-domain";
export function CashForms({
  branch,
  today,
  role,
  unconfigured,
}: {
  branch: string;
  today: string;
  role: string;
  unconfigured: Wallet[];
}) {
  return (
    <>
      {role === "admin" && unconfigured.length > 0 ? (
        <CashForm
          branch={branch}
          today={today}
          action="opening"
          wallets={unconfigured}
        />
      ) : null}
      {role !== "viewer" ? (
        <>
          <CashForm
            branch={branch}
            today={today}
            action="entry"
            wallets={Object.keys(walletNames) as Wallet[]}
          />
          <CashForm
            branch={branch}
            today={today}
            action="transfer"
            wallets={["cash_uzs", "card_uzs", "bank_uzs"]}
          />
        </>
      ) : null}
    </>
  );
}
function CashForm({
  branch,
  today,
  action,
  wallets,
}: {
  branch: string;
  today: string;
  action: "opening" | "entry" | "transfer";
  wallets: Wallet[];
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [key, setKey] = useState("");
  return (
    <details>
      <summary>
        {action === "opening"
          ? "Boshlang‘ich qoldiqni belgilash"
          : action === "entry"
            ? "Kirim yoki chiqim kiritish"
            : "Hamyonlar orasida o‘tkazish"}
      </summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          if (busy) return;
          setBusy(true);
          setError("");
          const requestKey = key || crypto.randomUUID();
          setKey(requestKey);
          const fields = Object.fromEntries(new FormData(form));
          try {
            const response = await fetch("/api/cash", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...fields,
                branchId: branch,
                requestKey,
                action,
              }),
            });
            const result = await response.json();
            if (!response.ok) {
              setKey("");
              throw new Error(result.error || "Saqlanmadi");
            }
            setKey("");
            form.reset();
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {action === "opening" ? (
          <p>
            Tanlangan sana boshidagi tekshirilgan qoldiqni yozing. Noma’lum
            bo‘lsa kiritmang. V1 da bu qoldiqni qayta tahrirlash yo‘q.
          </p>
        ) : null}
        <label>
          Hamyon
          <select name="wallet" required>
            {wallets.map((w) => (
              <option key={w} value={w}>
                {walletNames[w]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sana
          <input
            type="date"
            name="date"
            defaultValue={today}
            max={today}
            required
          />
        </label>
        <label>
          Summa
          <input
            name="amount"
            inputMode="decimal"
            pattern="[0-9]+(\.[0-9]{1,2})?"
            required
            placeholder="Masalan: 50000"
          />
        </label>
        <small>
          UZS — butun son. USD — nuqta bilan, ko‘pi bilan 2 kasr raqami.
        </small>
        {action === "entry" ? (
          <>
            <label>
              Yo‘nalish
              <select name="direction">
                <option value="in">Kirim</option>
                <option value="out">Chiqim</option>
              </select>
            </label>
            <label>
              Sabab
              <select name="category">
                {cashCategories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Izoh
              <input name="note" maxLength={160} />
            </label>
          </>
        ) : null}
        {action === "transfer" ? (
          <label>
            Qabul qiluvchi hamyon
            <select name="destination">
              {wallets.map((w) => (
                <option key={w} value={w}>
                  {walletNames[w]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {action === "opening" ? (
          <label>
            <input type="checkbox" required /> Sana boshidagi qoldiqni
            tekshirdim.
          </label>
        ) : null}
        <button disabled={busy}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </details>
  );
}
