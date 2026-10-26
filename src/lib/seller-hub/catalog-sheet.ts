export type SheetCell = string | number | null;

const WIDTHS = [240, 78, 72, 96, 120, 130, 72, 72, 88, 100, 72, 80, 88, 110, 72, 110, 110, 120, 140, 140, 64, 64, 320];

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cell(value: SheetCell, asText: boolean): string {
  if (value == null || value === "") {
    return `<Cell><Data ss:Type="String"></Data></Cell>`;
  }
  if (!asText && typeof value === "number" && Number.isFinite(value)) {
    return `<Cell ss:StyleID="num"><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  const text = String(value).replace(/\r\n/g, "\n").replace(/\n+/g, " ").trim();
  return `<Cell ss:StyleID="text"><Data ss:Type="String">${xmlEscape(text)}</Data></Cell>`;
}

/** Книга Excel, которую кабинет открывает таблицей: артикул и штрихкод остаются текстом. */
export function downloadCatalogSheet(
  headers: string[],
  rows: SheetCell[][],
  textColumns: number[],
  filename: string,
) {
  const text = new Set(textColumns);
  const columns = WIDTHS.slice(0, headers.length)
    .map((width) => `<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`)
    .join("");
  const headerRow = `<Row ss:StyleID="header">${headers
    .map((label) => `<Cell ss:StyleID="header"><Data ss:Type="String">${xmlEscape(label)}</Data></Cell>`)
    .join("")}</Row>`;
  const body = rows
    .map((row) => {
      const cells = headers.map((_, index) => cell(row[index] ?? "", text.has(index))).join("");
      return `<Row ss:AutoFitHeight="0" ss:Height="18">${cells}</Row>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
<Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#F4F6F8" ss:Pattern="Solid"/></Style>
<Style ss:ID="text"><NumberFormat ss:Format="@"/></Style>
<Style ss:ID="num"><NumberFormat ss:Format="0.##"/></Style>
</Styles>
<Worksheet ss:Name="Товары">
<Table>${columns}${headerRow}${body}</Table>
<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
<FreezePanes/>
<FrozenNoSplit/>
<SplitHorizontal>1</SplitHorizontal>
<TopRowBottomPane>1</TopRowBottomPane>
<ActivePane>2</ActivePane>
</WorksheetOptions>
</Worksheet>
</Workbook>`;
  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
