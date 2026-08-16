import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { normalizeAppSettings } from "./appSettings";
import { formatPaymentMode } from "./paymentUtils";

const formatCurrency = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

const formatDate = (date) =>
  new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const getPdfBase64 = (doc) => doc.output("datauristring").split(",")[1];

const getImageFormat = (dataUrl) => {
  if (String(dataUrl).startsWith("data:image/jpeg")) return "JPEG";
  if (String(dataUrl).startsWith("data:image/jpg")) return "JPEG";
  if (String(dataUrl).startsWith("data:image/webp")) return "WEBP";
  return "PNG";
};

const savePdf = (doc, fileName, settings) => {
  window.electronAPI.saveFile({
    directory: settings?.exportPath,
    fileName,
    base64Data: getPdfBase64(doc),
  });
};

const drawStoreHeader = (doc, settings, pageWidth, margin) => {
  const shopLine = [
    settings.shopAddress,
    settings.shopPhone ? `Mobile: ${settings.shopPhone}` : "",
    settings.shopEmail ? `Email: ${settings.shopEmail}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  doc.setDrawColor(35, 35, 35);
  doc.setFillColor(35, 35, 35);
  doc.rect(0, 0, pageWidth, 28, "F");

  if (settings.billLogo) {
    try {
      doc.addImage(settings.billLogo, getImageFormat(settings.billLogo), margin, 5, 18, 18);
    } catch (error) {
      // Ignore invalid image data and continue with text invoice header.
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(settings.shopName, settings.billLogo ? margin + 23 : margin, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(shopLine, settings.billLogo ? margin + 23 : margin, 21, {
    maxWidth: pageWidth - 85,
  });
};

export const exportSalesToPDF = (bills, appSettings) => {
  if (!bills || bills.length === 0) return;

  const settings = normalizeAppSettings(appSettings);
  const doc = new jsPDF();
  const fileName = `sales_report_${new Date().toISOString().slice(0, 10)}.pdf`;

  if (settings.billLogo) {
    try {
      doc.addImage(settings.billLogo, getImageFormat(settings.billLogo), 14, 8, 18, 18);
    } catch (error) {
      // Ignore invalid image data and keep report export usable.
    }
  }

  doc.setFont("helvetica", "bold");
  doc.text(settings.shopName, settings.billLogo ? 36 : 14, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(settings.shopAddress || "", settings.billLogo ? 36 : 14, 20);
  doc.setFontSize(16);
  doc.text("Sales Report", 14, 36);

  autoTable(doc, {
    startY: 46,
    head: [["Invoice No.", "Date", "Customer", "Phone", "Payment", "Items", "Total"]],
    body: bills.map((b) => [
      String(b.id),
      formatDate(b.date),
      b.customer?.name || "Walk-in",
      b.customer?.phone || "-",
      formatPaymentMode(b.paymentMode),
      b.items.length,
      formatCurrency(b.total),
    ]),
  });

  savePdf(doc, fileName, settings);
};

export const exportProductsToPDF = (products, appSettings) => {
  if (!products || products.length === 0) return false;

  const settings = normalizeAppSettings(appSettings);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const fileName = `product_list_${new Date().toISOString().slice(0, 10)}.pdf`;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(settings.shopName || "Kutty Couture", 14, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(settings.shopAddress || "Product inventory list", 14, 21);
  doc.setFontSize(15);
  doc.text("Product List", 14, 32);
  doc.setFontSize(9);
  doc.text(`Generated: ${formatDate(new Date())}`, 14, 38);

  autoTable(doc, {
    startY: 44,
    head: [["#", "Product", "SKU", "Category", "Stock", "Purchase Cost", "Selling Price", "Min Stock"]],
    body: products.map((product, index) => [
      index + 1,
      product.name || "-",
      product.sku || product.barcode || "-",
      product.category || "No Category",
      String(Number(product.quantity || 0)),
      formatCurrency(product.price),
      formatCurrency(product.sellingPrice ?? product.pricing?.single),
      String(Number(product.minStock || 0)),
    ]),
    theme: "grid",
    headStyles: {
      fillColor: [35, 35, 35],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
  });

  savePdf(doc, fileName, settings);
  return true;
};

export const createInvoicePdf = (bill, appSettings) => {
  const settings = normalizeAppSettings(appSettings);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const invoiceNo = String(bill.id || Date.now());
  const subtotal =
    typeof bill.subtotal === "number"
      ? bill.subtotal
      : bill.items?.reduce((sum, item) => sum + Number(item.total || 0), 0) ||
        0;
  const taxAmount = Number(bill.taxAmount || 0);
  const discountAmount = Number(bill.discountAmount || 0);
  const total = Number(bill.total || 0);
  const adjustment = total - subtotal - taxAmount + discountAmount;

  drawStoreHeader(doc, settings, pageWidth, margin);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("INVOICE", pageWidth - margin, 14, { align: "right" });
  doc.setFontSize(10);
  doc.text(`#${invoiceNo}`, pageWidth - margin, 22, { align: "right" });

  doc.setTextColor(35, 35, 35);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Bill To", margin, 42);
  doc.text("Invoice Details", 128, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(bill.customer?.name || "Walk-in Customer", margin, 49);
  doc.text(`Phone: ${bill.customer?.phone || "-"}`, margin, 55);
  if (bill.customer?.email) {
    doc.text(`Email: ${bill.customer.email}`, margin, 61);
  }

  doc.text(`Date: ${formatDate(bill.date)}`, 128, 49);
  doc.text(`Payment: ${formatPaymentMode(bill.paymentMode)}`, 128, 55);

  autoTable(doc, {
    startY: 72,
    head: [["#", "Item", "Qty", "Unit Price", "Item Discount", "Amount"]],
    body: (bill.items || []).map((item, index) => [
      index + 1,
      item.name,
      item.qty,
      formatCurrency(item.unitPrice ?? Number(item.total || 0) / Number(item.qty || 1)),
      Number(item.discountPercent || 0) > 0
        ? `${Number(item.discountPercent).toFixed(2)}% (-${formatCurrency(item.discountAmount)})`
        : "-",
      formatCurrency(item.total),
    ]),
    theme: "grid",
    headStyles: {
      fillColor: [35, 35, 35],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    bodyStyles: {
      textColor: [35, 35, 35],
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 12 },
      2: { halign: "center", cellWidth: 18 },
      3: { halign: "right", cellWidth: 30 },
      4: { halign: "right", cellWidth: 36 },
      5: { halign: "right", cellWidth: 34 },
    },
  });

  const finalY = doc.lastAutoTable.finalY + 8;
  const totalsX = 126;
  const valuesX = pageWidth - margin;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Subtotal", totalsX, finalY);
  doc.text(formatCurrency(subtotal), valuesX, finalY, { align: "right" });

  let rowY = finalY + 7;
  if (taxAmount) {
    doc.text(
      `Tax${bill.taxPercent ? ` (${bill.taxPercent}%)` : ""}`,
      totalsX,
      rowY,
    );
    doc.text(formatCurrency(taxAmount), valuesX, rowY, { align: "right" });
    rowY += 7;
  }

  if (discountAmount) {
    doc.text(
      `Discount${bill.discountPercent ? ` (${bill.discountPercent}%)` : ""}`,
      totalsX,
      rowY,
    );
    doc.text(`- ${formatCurrency(discountAmount)}`, valuesX, rowY, {
      align: "right",
    });
    rowY += 7;
  }

  if (Math.abs(adjustment) > 0.009) {
    doc.text("Adjustment", totalsX, rowY);
    doc.text(formatCurrency(adjustment), valuesX, rowY, { align: "right" });
    rowY += 7;
  }

  doc.setDrawColor(35, 35, 35);
  doc.line(totalsX, rowY - 2, valuesX, rowY - 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Total", totalsX, rowY + 5);
  doc.text(formatCurrency(total), valuesX, rowY + 5, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Thank you for shopping with ${settings.shopName}.`, margin, 276);
  doc.text("This invoice is computer generated.", margin, 282);

  return doc;
};

export const getInvoicePdfFileName = (bill) =>
  `invoice_${String(bill?.id || Date.now())}.pdf`;

export const downloadInvoice = (bill, settings) => {
  if (!bill) return;

  savePdf(createInvoicePdf(bill, settings), getInvoicePdfFileName(bill), settings);
};
