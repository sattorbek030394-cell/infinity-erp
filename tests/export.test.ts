import { test } from "node:test";
import assert from "node:assert/strict";
import { exportWorkbook } from "../lib/export-workbook";
test("xlsx export preserves IMEI and hostile labels as text, exact numeric amounts and empty sheets", async () => {
  const bytes = Buffer.from(
    await exportWorkbook({
      branch: "DEMO & <test>",
      today: "2026-10-11",
      createdAt: "2026-10-11T00:00:00Z",
      inventory: [
        {
          id: "demo",
          model: '=HYPERLINK("https://invalid.example")',
          imei: "000000000000001",
          cost: 123456,
          status: "available",
        },
      ],
      contracts: [],
      payments: [],
      arrears: [],
    }),
  );
  const entries: Record<string, string> = {};
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(offset + 8), 0);
    const size = bytes.readUInt32LE(offset + 18),
      length = bytes.readUInt16LE(offset + 26),
      extra = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + length).toString();
    const start = offset + 30 + length + extra;
    entries[name] = bytes.subarray(start, start + size).toString();
    offset = start + size;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  assert.equal(Object.keys(entries).length, 10);
  assert.ok(entries["xl/workbook.xml"].includes("Qarzdorlar"));
  const sheet = entries["xl/worksheets/sheet2.xml"];
  assert.ok(
    sheet.includes(
      '<c r="C2" s="0" t="inlineStr"><is><t xml:space="preserve">000000000000001</t>',
    ),
  );
  assert.ok(sheet.includes("=HYPERLINK(&quot;https://invalid.example&quot;)"));
  assert.ok(sheet.includes('<c r="D2" s="2" t="n"><v>123456</v>'));
  assert.ok(!Object.values(entries).some((s) => s.includes("<f>")));
  assert.ok(
    entries["xl/worksheets/sheet1.xml"].includes("DEMO &amp; &lt;test&gt;"),
  );
  assert.ok(
    entries["xl/worksheets/sheet3.xml"].includes('dimension ref="A1:J1"'),
  );
  await assert.rejects(
    exportWorkbook({
      branch: "DEMO",
      today: "2026-10-11",
      createdAt: "",
      inventory: [{ cost: Number.MAX_SAFE_INTEGER + 1 }],
      contracts: [],
      payments: [],
      arrears: [],
    }),
  );
});
