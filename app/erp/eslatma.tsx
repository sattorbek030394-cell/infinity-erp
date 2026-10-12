"use client";
import { useState } from "react";

/**
 * Mijozga yuboriladigan eslatma matni (taklif 3.7).
 *
 * Bot hali yo'q: matn tayyorlanadi va nusxalanadi, undiruvchi uni
 * Telegram yoki SMS orqali yuboradi. Telefon raqami bo'lsa qo'ng'iroq
 * havolasi ham chiqadi.
 */
export function Eslatma({ text, phone }: { text: string; phone?: string }) {
  const [holat, setHolat] = useState("");
  async function nusxala() {
    try {
      await navigator.clipboard.writeText(text);
      setHolat("Nusxalandi");
    } catch {
      // Clipboard ruxsati bo'lmasa matnni ko'rsatamiz - qo'lda nusxalanadi.
      setHolat(text);
    }
  }
  return (
    <>
      <button type="button" onClick={nusxala}>
        Eslatma matni
      </button>
      {phone ? (
        <>
          {" "}
          <a className="textlink" href={"tel:" + phone.replace(/\s/g, "")}>
            {phone}
          </a>
        </>
      ) : null}
      {holat ? <small>{holat}</small> : null}
    </>
  );
}
