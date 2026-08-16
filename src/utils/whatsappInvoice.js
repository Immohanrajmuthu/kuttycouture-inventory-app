import { normalizeAppSettings } from "./appSettings";
import { formatPaymentMode } from "./paymentUtils";

const formatCurrency = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

const normalizeWhatsAppPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 10) return `91${digits}`;
  return digits;
};

export const buildWhatsAppInvoiceMessage = (bill, appSettings) => {
  const settings = normalizeAppSettings(appSettings);

  const lines = [
    `Hi ${bill.customer?.name || "Customer"},`,
    "",
    `Thank you for shopping with ${settings.shopName}.`,
    "Please find your invoice details below.",
    "",
    settings.shopName,
    settings.shopAddress,
    settings.shopPhone ? `Mobile: ${settings.shopPhone}` : "",
    settings.shopEmail ? `Email: ${settings.shopEmail}` : "",
    `Invoice #${bill.id}`,
    `Date: ${bill.date}`,
    `Customer: ${bill.customer?.name || "Walk-in Customer"}`,
    "",
    "Items:",
    ...(bill.items || []).map(
      (item, index) =>
        `${index + 1}. ${item.name} x ${item.qty}${
          Number(item.discountPercent || 0) > 0
            ? ` (${Number(item.discountPercent).toFixed(2)}% item discount)`
            : ""
        } - ${formatCurrency(item.total)}`,
    ),
    "",
    `Subtotal: ${formatCurrency(bill.subtotal)}`,
  ];

  if (Number(bill.taxAmount || 0) > 0) {
    lines.push(
      `Tax${bill.taxPercent ? ` (${bill.taxPercent}%)` : ""}: ${formatCurrency(
        bill.taxAmount,
      )}`,
    );
  }

  if (Number(bill.discountAmount || 0) > 0) {
    lines.push(
      `Discount${
        bill.discountPercent ? ` (${bill.discountPercent}%)` : ""
      }: -${formatCurrency(bill.discountAmount)}`,
    );
  }

  lines.push(
    `Total: ${formatCurrency(bill.total)}`,
    `Payment: ${formatPaymentMode(bill.paymentMode)}`,
    "",
    "Regards,",
    settings.shopName,
  );

  return lines.filter((line) => line !== "").join("\n");
};

export const sendInvoiceToWhatsApp = (bill, settings) => {
  const whatsappPhone = normalizeWhatsAppPhone(bill.customer?.phone);

  if (!whatsappPhone) {
    alert("Please enter customer phone number before sending WhatsApp invoice.");
    return;
  }

  const message = encodeURIComponent(buildWhatsAppInvoiceMessage(bill, settings));
  window.open(`https://wa.me/${whatsappPhone}?text=${message}`, "_blank");
};
