// Minimal, macro-free OOXML writer for static report values. Strings are inline
// strings (never formulas), so IMEIs and formula-like customer labels stay text.
export type ExportSheet = {
  name: string;
  headers: string[];
  rows: (string | number)[][];
  moneyColumns: number[];
};
const xml = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
function column(n: number) {
  let value = "";
  for (; n; n = Math.floor((n - 1) / 26))
    value = String.fromCharCode(65 + ((n - 1) % 26)) + value;
  return value;
}
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries: [string, string][]) {
  const parts: Buffer[] = [],
    directory: Buffer[] = [];
  let offset = 0;
  for (const [path, source] of entries) {
    const name = Buffer.from(path),
      bytes = Buffer.from(source),
      crc = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    parts.push(local, name, bytes);
    directory.push(central, name);
    offset += local.length + name.length + bytes.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(
    directory.reduce((n, b) => n + b.length, 0),
    12,
  );
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, ...directory, end]));
}
export function staticWorkbook(sheets: ExportSheet[]) {
  const types = "application/vnd.openxmlformats-officedocument.spreadsheetml.";
  const entries: [string, string][] = [
    [
      "[Content_Types].xml",
      declaration +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="' +
        types +
        'sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="' +
        types +
        'styles+xml"/>' +
        sheets
          .map(
            (_, i) =>
              '<Override PartName="/xl/worksheets/sheet' +
              (i + 1) +
              '.xml" ContentType="' +
              types +
              'worksheet+xml"/>',
          )
          .join("") +
        "</Types>",
    ],
    [
      "_rels/.rels",
      declaration +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      "xl/workbook.xml",
      declaration +
        '<workbook xmlns="' +
        ns +
        '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets
          .map(
            (s, i) =>
              '<sheet name="' +
              xml(s.name) +
              '" sheetId="' +
              (i + 1) +
              '" r:id="rId' +
              (i + 1) +
              '"/>',
          )
          .join("") +
        "</sheets></workbook>",
    ],
    [
      "xl/_rels/workbook.xml.rels",
      declaration +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map(
            (_, i) =>
              '<Relationship Id="rId' +
              (i + 1) +
              '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
              (i + 1) +
              '.xml"/>',
          )
          .join("") +
        '<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ],
    [
      "xl/styles.xml",
      declaration +
        '<styleSheet xmlns="' +
        ns +
        '"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0 &quot;UZS&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF183B56"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    ],
  ];
  sheets.forEach((sheet, index) => {
    const rows = [sheet.headers, ...sheet.rows];
    const last = column(sheet.headers.length) + rows.length;
    const content = rows
      .map(
        (row, i) =>
          '<row r="' +
          (i + 1) +
          '">' +
          row
            .map((v, j) => {
              const ref = column(j + 1) + (i + 1),
                style =
                  i === 0 ? 1 : sheet.moneyColumns.includes(j + 1) ? 2 : 0;
              if (typeof v === "number") {
                if (!Number.isSafeInteger(v)) throw new Error("Unsafe amount");
                return (
                  '<c r="' +
                  ref +
                  '" s="' +
                  style +
                  '" t="n"><v>' +
                  v +
                  "</v></c>"
                );
              }
              return (
                '<c r="' +
                ref +
                '" s="' +
                style +
                '" t="inlineStr"><is><t xml:space="preserve">' +
                xml(v) +
                "</t></is></c>"
              );
            })
            .join("") +
          "</row>",
      )
      .join("");
    entries.push([
      "xl/worksheets/sheet" + (index + 1) + ".xml",
      declaration +
        '<worksheet xmlns="' +
        ns +
        '"><dimension ref="A1:' +
        last +
        '"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="' +
        sheet.headers.length +
        '" width="26" customWidth="1"/></cols><sheetData>' +
        content +
        '</sheetData><autoFilter ref="A1:' +
        last +
        '"/></worksheet>',
    ]);
  });
  return zip(entries);
}
