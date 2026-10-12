/**
 * Reja ko'rsatkichlarining nomlari va ro'yxati.
 *
 * Bu modul ataylab sof: bazaga ham, `pg` ga ham bog'lanmaydi. Client
 * komponent (target-form.tsx) ko'rsatkich nomini shu yerdan oladi.
 * Agar u `lib/targets.ts` dan olsa, `pg` brauzer to'plamiga tushib
 * ketadi va `next dev` "Can't resolve 'util/types'" deb yiqiladi.
 */
export const METRICS = [
  "sotuv_dona_naqd",
  "sotuv_dona_nasiya",
  "sotuv_summa_naqd",
  "sotuv_summa_nasiya",
  "undirish",
  "sof_foyda",
] as const;
export type Metric = (typeof METRICS)[number];
export const METRIC_NOMI: Record<Metric, string> = {
  sotuv_dona_naqd: "Sotuv dona — naqd",
  sotuv_dona_nasiya: "Sotuv dona — nasiya",
  sotuv_summa_naqd: "Sotuv summasi — naqd",
  sotuv_summa_nasiya: "Sotuv summasi — nasiya",
  undirish: "Nasiya undirish",
  sof_foyda: "Sof foyda",
};
/** Dona bilan o'lchanadigan ko'rsatkichlar - so'm formati qo'llanmaydi. */
export const DONA: Metric[] = ["sotuv_dona_naqd", "sotuv_dona_nasiya"];
