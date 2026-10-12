/**
 * Investor modulining nomlari - ekranda ham, serverda ham kerak.
 *
 * Alohida fayl, chunki `lib/investor.ts` bazaga ulanadi: nomlarni
 * shundan import qilsak, brauzer paketiga `pg` ham tushib qolardi.
 */
export const QOIDALAR = ["capital_month", "open_capital", "daily"] as const;

export const QOIDA_NOMI: Record<string, string> = {
  capital_month: "Butun davr: kapital × oy",
  open_capital: "Oy boshidagi kapital",
  daily: "Oy ichida kunlik o‘rtacha",
};

export const YOZUV_NOMI: Record<string, string> = {
  capital: "Kapital kiritildi",
  return: "Kapital qaytarildi",
  profit: "Foyda ulushi",
  loss: "Zarar ulushi",
  payout: "Daromad olindi",
};
