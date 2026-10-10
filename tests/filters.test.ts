import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFilters, matchesSearch } from "../lib/filters";
test("filters reject invalid dates, methods, arrays and unsafe page values", () => {
  const f = parseFilters({
    q: "  phone  ",
    page: "-4",
    method: "sql",
    from: "2026-02-30",
    to: ["2026-01-01"],
  });
  assert.deepEqual(f, { q: "phone", method: "", from: "", to: "", page: 1 });
  assert.equal(
    parseFilters({ q: "x".repeat(1000), page: "9999999999" }).q.length,
    80,
  );
  assert.equal(
    parseFilters({ page: "2", method: "cash", from: "2026-02-28" }).page,
    2,
  );
  assert.equal(
    matchesSearch("%", "anything"),
    false,
    "SQL wildcard characters are literal search terms",
  );
  assert.equal(
    matchesSearch("PHONE", "Synthetic phone", "000000000000001"),
    true,
  );
});
