// Qurilma nazorati holatlari va qarorlarining nomlari. Mijoz tomonidagi
// komponent ham shu fayldan oladi: server moduliga (baza, sessiya) ulanib
// ketmasligi uchun alohida turadi.
export const HOLAT_NOMI: Record<string, string> = {
  none: "O‘rnatilmagan",
  installed: "Nazoratda",
  blocked: "Bloklangan",
  released: "Nazoratdan chiqarilgan",
};
export const QAROR_NOMI: Record<string, string> = {
  install: "Nazoratga olindi",
  block: "Bloklandi",
  unblock: "Ochildi",
  release: "Nazoratdan chiqarildi",
};
