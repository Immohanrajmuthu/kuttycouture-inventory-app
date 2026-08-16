import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { downloadInvoice } from "../utils/exportPDF";
import { normalizeAppSettings } from "../utils/appSettings";
import { formatPaymentMode } from "../utils/paymentUtils";

const formatCurrency = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

const formatDate = (date) =>
  new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const Invoice = ({ settings }) => {
  const [bill, setBill] = useState(null);
  const appSettings = normalizeAppSettings(settings);

  useEffect(() => {
    window.electronAPI.getData("selectedInvoice").then((data) => {
      if (data) setBill(data);
    });
  }, []);

  if (!bill) return <p>No invoice found</p>;

  const subtotal =
    typeof bill.subtotal === "number"
      ? bill.subtotal
      : bill.items?.reduce((sum, item) => sum + Number(item.total || 0), 0) ||
        0;
  const taxAmount = Number(bill.taxAmount || 0);
  const discountAmount = Number(bill.discountAmount || 0);
  const total = Number(bill.total || 0);
  const adjustment = total - subtotal - taxAmount + discountAmount;

  return (
    <Box sx={{ p: 3, maxWidth: 820, margin: "auto" }}>
      <Box
        sx={{
          border: "1px solid #ddd",
          borderRadius: 1,
          overflow: "hidden",
          backgroundColor: "#fff",
        }}
      >
        <Box
          sx={{
            p: 2,
            display: "flex",
            justifyContent: "space-between",
            backgroundColor: "#232323",
            color: "#fff",
          }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {appSettings.shopName}
            </Typography>
            <Typography variant="body2">
              {[
                appSettings.shopAddress,
                appSettings.shopPhone ? `Mobile: ${appSettings.shopPhone}` : "",
                appSettings.shopEmail ? `Email: ${appSettings.shopEmail}` : "",
              ]
                .filter(Boolean)
                .join(" | ")}
            </Typography>
          </Box>
          {appSettings.billLogo && (
            <Box sx={{ mx: 2 }}>
              <img
                src={appSettings.billLogo}
                alt="Bill logo"
                style={{ maxHeight: 48, maxWidth: 120, objectFit: "contain" }}
              />
            </Box>
          )}
          <Box sx={{ textAlign: "right" }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              INVOICE
            </Typography>
            <Typography variant="body2">#{bill.id}</Typography>
          </Box>
        </Box>

        <Box sx={{ p: 2, display: "flex", justifyContent: "space-between" }}>
          <Box>
            <Typography sx={{ fontWeight: 700 }}>Bill To</Typography>
            <Typography>{bill.customer?.name || "Walk-in Customer"}</Typography>
            <Typography>Phone: {bill.customer?.phone || "-"}</Typography>
            {bill.customer?.email && (
              <Typography>Email: {bill.customer.email}</Typography>
            )}
          </Box>
          <Box sx={{ textAlign: "right" }}>
            <Typography>Date: {formatDate(bill.date)}</Typography>
            <Typography>Payment: {formatPaymentMode(bill.paymentMode)}</Typography>
          </Box>
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
                <TableCell>#</TableCell>
                <TableCell>Item</TableCell>
                <TableCell align="center">Qty</TableCell>
                <TableCell align="right">Unit Price</TableCell>
                <TableCell align="right">Item Discount</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(bill.items || []).map((item, index) => (
                <TableRow key={item.id || index}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell align="center">{item.qty}</TableCell>
                  <TableCell align="right">
                    {formatCurrency(item.unitPrice ?? Number(item.total || 0) / Number(item.qty || 1))}
                  </TableCell>
                  <TableCell align="right">
                    {Number(item.discountPercent || 0) > 0
                      ? `${Number(item.discountPercent).toFixed(2)}% (-${formatCurrency(item.discountAmount)})`
                      : "-"}
                  </TableCell>
                  <TableCell align="right">{formatCurrency(item.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ p: 2, display: "flex", justifyContent: "flex-end" }}>
          <Box sx={{ width: 280 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography>Subtotal</Typography>
              <Typography>{formatCurrency(subtotal)}</Typography>
            </Box>
            {taxAmount > 0 && (
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography>
                  Tax{bill.taxPercent ? ` (${bill.taxPercent}%)` : ""}
                </Typography>
                <Typography>{formatCurrency(taxAmount)}</Typography>
              </Box>
            )}
            {discountAmount > 0 && (
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography>
                  Discount
                  {bill.discountPercent ? ` (${bill.discountPercent}%)` : ""}
                </Typography>
                <Typography>- {formatCurrency(discountAmount)}</Typography>
              </Box>
            )}
            {Math.abs(adjustment) > 0.009 && (
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography>Adjustment</Typography>
                <Typography>{formatCurrency(adjustment)}</Typography>
              </Box>
            )}
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="h6">Total</Typography>
              <Typography variant="h6">{formatCurrency(total)}</Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end", gap: 2 }}>
        <Button variant="outlined" onClick={() => window.print()}>
          Print
        </Button>
        <Button
          variant="contained"
          onClick={() => downloadInvoice(bill, appSettings)}
        >
          Download PDF
        </Button>
      </Box>
    </Box>
  );
};

export default Invoice;
