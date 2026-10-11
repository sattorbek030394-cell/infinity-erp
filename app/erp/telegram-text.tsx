"use client";
import { useState } from "react";

/**
 * Telegram uchun tayyor matn.
 *
 * Excel'ning Hisobot varag'ida shu matn bor edi va egasi uni har kuni
 * guruhga tashlaydi. Dastur ham xuddi shu formatni beradi: bir bosishda
 * nusxalanadi.
 */
export function TelegramText({ text }: { text: string }) {
  const [holat, setHolat] = useState("");
  return (
    <section className="detailsection">
      <h2>Telegram uchun tayyor matn</h2>
      <pre className="tgtext">{text}</pre>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setHolat("Nusxalandi — Telegramga qo‘yib yuboring");
          } catch {
            setHolat("Nusxalanmadi: matnni belgilab qo‘lda nusxalang");
          }
        }}
      >
        Matnni nusxalash
      </button>
      {holat ? <small>{holat}</small> : null}
    </section>
  );
}
