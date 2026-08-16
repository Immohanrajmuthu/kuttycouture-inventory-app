import * as XLSX from "xlsx";
import { formatPaymentMode } from "./paymentUtils";

const saveWorkbook = (workbook, fileName, settings) => {
  const base64Data = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "base64",
  });

  window.electronAPI.saveFile({
    directory: settings?.exportPath,
    fileName,
    base64Data,
  });
};

export const exportSalesToExcel = (bills, settings) => {
  if (!bills || bills.length === 0) return;

  const data = bills.map((b) => ({
    "Invoice No.": b.id,
    Date: new Date(b.date).toLocaleString(),
    Customer: b.customer?.name || "Walk-in",
    Phone: b.customer?.phone || "-",
    Payment: formatPaymentMode(b.paymentMode),
    Items: b.items.length,
    Total: b.total,
    Profit: b.profit,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Sales");

  const fileName = `sales_report_${new Date().toISOString().slice(0,10)}`;

  saveWorkbook(workbook, fileName + ".xlsx", settings);
};
