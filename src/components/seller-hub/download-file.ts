/** Сохраняет файл, пришедший от WB в base64 (стикеры, QR поставки). */
export function downloadBase64File(base64: string, filename: string, mime: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const csvCell = (value: string | number | null | undefined): string => {
  const text = value == null ? "" : String(value);
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Скачивает таблицу как CSV для Excel: разделитель «;», BOM, чтобы кириллица открылась верно. */
export function downloadCsv(filename: string, head: string[], rows: Array<Array<string | number | null | undefined>>) {
  const lines = [head, ...rows].map((row) => row.map(csvCell).join(";"));
  const blob = new Blob([`﻿${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
