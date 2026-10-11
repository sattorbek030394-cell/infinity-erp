import type { HistoryFilters } from "../../lib/filters";
export function SearchForm({
  branchId,
  tab,
  filters,
  status,
}: {
  branchId: string;
  tab: string;
  filters: HistoryFilters;
  status: string;
}) {
  return (
    <form className="searchbar" action="/erp" method="get">
      <input type="hidden" name="branch" value={branchId} />
      <input type="hidden" name="tab" value={tab} />
      <label>
        Qidirish
        <input
          name="q"
          type="search"
          maxLength={80}
          defaultValue={filters.q}
          placeholder={
            tab === "inventory" || tab === "sales"
              ? "Model yoki IMEI"
              : "Mijoz belgisi, IMEI yoki shartnoma ID"
          }
        />
      </label>
      {tab === "inventory" || tab === "contracts" ? (
        <label>
          Holat
          <select name="status" defaultValue={status}>
            <option value="">Barchasi</option>
            {tab === "inventory" ? (
              <>
                <option value="available">Omborda</option>
                <option value="sold">Sotilgan</option>
              </>
            ) : (
              <>
                <option value="active">Qarzi bor</option>
                <option value="paid">To‘liq to‘langan</option>
              </>
            )}
          </select>
        </label>
      ) : null}
      {tab === "payments" || tab === "sales" ? (
        <>
          <label>
            To‘lov usuli
            <select name="method" defaultValue={filters.method}>
              <option value="">Barchasi</option>
              <option value="cash">Naqd</option>
              <option value="card">Karta</option>
              <option value="transfer">O‘tkazma</option>
            </select>
          </label>
          <label>
            Sanadan
            <input name="from" type="date" defaultValue={filters.from} />
          </label>
          <label>
            Sanagacha
            <input name="to" type="date" defaultValue={filters.to} />
          </label>
        </>
      ) : null}
      <button>Qidirish</button>
      <a href={"/erp?branch=" + branchId + "&tab=" + tab}>Tozalash</a>
      {filters.from && filters.to && filters.from > filters.to ? (
        <p role="alert">Boshlanish sanasi tugash sanasidan keyin kelmasin.</p>
      ) : null}
    </form>
  );
}
