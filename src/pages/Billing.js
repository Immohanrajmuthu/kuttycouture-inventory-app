import React, { useState, useEffect, useMemo } from "react";
import { Box, TextField, Button, Typography } from "@mui/material";
import { getBestPriceWithBreakdown } from "../utils/pricingUtils";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { sendInvoiceToWhatsApp } from "../utils/whatsappInvoice";

const Billing = ({ products, setProducts, bills, setBills, settings }) => {
  const [selectedId, setSelectedId] = useState("");
  const [qty, setQty] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [taxPercent, setTaxPercent] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [cart, setCart] = useState([]);
  const [isCartLoaded, setIsCartLoaded] = useState(false);

  useEffect(() => {
    window.electronAPI.getData("cart").then((savedCart) => {
      setCart(savedCart || []);
      setIsCartLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (isCartLoaded) window.electronAPI.setData("cart", cart);
  }, [cart, isCartLoaded]);

  const selectedProduct = products.find((p) => p.id === selectedId);
  const isPriced = Number(selectedProduct?.pricing?.single || 0) > 0;
  const selectedStock = Number(selectedProduct?.quantity || 0);

  // 🔥 calculate price
  const pricing = selectedProduct?.pricing;

  const preview = useMemo(() => {
    if (!pricing) return { total: 0, breakdown: "" };
    return getBestPriceWithBreakdown(qty, pricing);
  }, [qty, pricing]);

  const costPerUnit = Number(selectedProduct?.price || 0);
  const totalCost = costPerUnit * qty;

  const grandTotal = cart.reduce((sum, item) => sum + item.total, 0);
  const totalProfit = cart.reduce((sum, item) => sum + item.profit, 0);

  const profit = preview.total - totalCost;
  const taxAmount = (grandTotal * taxPercent) / 100;
  const discountAmount = (grandTotal * discountPercent) / 100;

  const finalTotal = grandTotal + taxAmount - discountAmount;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 300); // 300ms delay

    return () => clearTimeout(timer);
  }, [searchText]);

  const filteredProducts = useMemo(() => {
    if (!debouncedSearch.trim()) return [];

    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(debouncedSearch.toLowerCase()),
    );
  }, [debouncedSearch, products]);

  const recalcItem = (product, qty) => {
    const preview = getBestPriceWithBreakdown(qty, product.pricing);
    const cost = Number(product.price || 0) * qty;
    const profit = preview.total - cost;

    return {
      qty,
      total: preview.total,
      cost,
      profit,
      breakdown: preview.breakdown,
    };
  };

  const removeItem = (id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const getCartQtyForProduct = (productId, excludeCartItemId) =>
    cart.reduce((sum, item) => {
      if (item.productId !== productId || item.id === excludeCartItemId) {
        return sum;
      }
      return sum + Number(item.qty || 0);
    }, 0);

  const getSoldQtyByProduct = () =>
    cart.reduce((acc, item) => {
      acc[item.productId] = (acc[item.productId] || 0) + Number(item.qty || 0);
      return acc;
    }, {});

  const validateCartStock = () => {
    const soldQtyByProduct = getSoldQtyByProduct();

    for (const [productId, soldQty] of Object.entries(soldQtyByProduct)) {
      const product = products.find((p) => String(p.id) === String(productId));
      const availableQty = Number(product?.quantity || 0);

      if (!product || soldQty > availableQty) {
        alert(
          `${product?.name || "Product"} has only ${availableQty} in stock. Please update the cart quantity.`,
        );
        return false;
      }
    }

    return true;
  };

  const deductStockForCart = () => {
    const soldQtyByProduct = getSoldQtyByProduct();

    setProducts((prev) =>
      prev.map((product) => {
        const soldQty = Number(soldQtyByProduct[product.id] || 0);
        if (soldQty === 0) return product;

        return {
          ...product,
          quantity: Math.max(0, Number(product.quantity || 0) - soldQty),
        };
      }),
    );
  };

  const updateQty = (id, newQty) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        const product = products.find((p) => p.id === item.productId);
        if (!product) return item;
        const availableQty = Number(product.quantity || 0);
        const otherCartQty = getCartQtyForProduct(item.productId, item.id);
        const maxQty = Math.max(0, availableQty - otherCartQty);
        if (maxQty === 0) {
          alert(`${product.name} is out of stock.`);
          return item;
        }
        const safeQty = Math.min(Math.max(1, newQty), maxQty);

        if (newQty > maxQty) {
          alert(`${product.name} has only ${maxQty} available.`);
        }

        return {
          ...item,
          ...recalcItem(product, safeQty),
        };
      }),
    );
  };

  const handleClearCart = (shouldConfirm = true) => {
    if (!shouldConfirm || window.confirm("Clear all items?")) {
      setCart([]);
    }
  };
  const saveBill = () => {
    if (cart.length === 0) return null;
    if (!validateCartStock()) return null;

    const newBill = {
      id: Date.now(),
      items: cart,
      subtotal: grandTotal,
      taxPercent,
      taxAmount,
      discountPercent,
      discountAmount,
      total: finalTotal,
      profit: totalProfit,
      date: new Date().toISOString(),

      // ✅ NEW FIELDS
      customer: {
        name: customerName,
        phone: phone,
        email: email,
      },

      paymentMode: paymentMode,
    };

    deductStockForCart();
    setBills((prev) => [newBill, ...prev]);

    handleClearCart(false);

    // reset customer fields (optional)
    setCustomerName("");
    setPhone("");
    setEmail("");

    return newBill;
  };

  const handleSaveAndPrint = () => {
    const bill = saveBill();
    if (!bill) return;

    setTimeout(() => {
      window.print();
    }, 300);
  };

  const handleSaveOnly = () => {
    const bill = saveBill();
    if (!bill) return;
    alert("Bill saved!");
  };

  const handleSaveAndWhatsApp = () => {
    const bill = saveBill();
    if (!bill) return;

    sendInvoiceToWhatsApp(bill, settings);
  };

  // ➕ Add to cart
  const addToCart = () => {
    if (!selectedProduct || qty <= 0) return;
    const existingCartQty = getCartQtyForProduct(selectedProduct.id);
    const availableQty = selectedStock - existingCartQty;

    if (availableQty <= 0) {
      alert(`${selectedProduct.name} is out of stock.`);
      return;
    }

    if (qty > availableQty) {
      alert(`${selectedProduct.name} has only ${availableQty} available.`);
      return;
    }

    setCart((prev) => [
      ...prev,
      {
        id: Date.now(),
        productId: selectedProduct.id,
        name: selectedProduct.name,
        qty,
        total: preview.total,
        cost: totalCost,
        profit,
        breakdown: preview.breakdown,
      },
    ]);
    setQty(1);
    setSearchText("");
    setSelectedId("");
  };

  return (
    <Box sx={{ display: "flex", gap: 2, p: 2 }}>
      {/* LEFT SIDE */}
      <Box sx={{ flex: 2 }}>
        {/* Product Search */}
        <Box sx={{ p: 2, border: "1px solid #ddd", borderRadius: 2 }}>
          <Typography variant="h6">🔍 Product Search</Typography>
          {selectedProduct && !isPriced && (
            <Typography color="error" sx={{ mt: 1 }}>
              ⚠ Please set price before adding to cart
            </Typography>
          )}
          {/* FLEX ROW */}
          <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
            {/* LEFT SIDE (search + dropdown) */}
            <Box sx={{ flex: 1, position: "relative" }}>
              {/* Search Input */}
              <TextField
                fullWidth
                placeholder="Search by product name, barcode..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />

              {/* 🔽 DROPDOWN BELOW INPUT */}
              {debouncedSearch && filteredProducts.length > 0 && (
                <Box
                  sx={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    border: "1px solid #ddd",
                    borderRadius: 1,
                    mt: 0.5,
                    maxHeight: 200,
                    overflowY: "auto",
                    backgroundColor: "#fff",
                    zIndex: 10,
                  }}
                >
                  {filteredProducts.map((p) => (
                    <Box
                      key={p.id}
                      sx={{
                        p: 1,
                        cursor: "pointer",
                        "&:hover": { backgroundColor: "#f5f5f5" },
                      }}
                      onClick={() => {
                        setSelectedId(p.id);
                        setSearchText(p.name);
                        setDebouncedSearch(""); 
                      }}
                    >
                      {p.name}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>

            {/* RIGHT SIDE BUTTON */}
            <Button
              variant="contained"
              onClick={addToCart}
              disabled={!selectedProduct || !isPriced || selectedStock <= 0}
            >
              ➕ Add to Cart
            </Button>
          </Box>
          {selectedProduct && (
            <Typography
              color={selectedStock <= 0 ? "error" : "text.secondary"}
              sx={{ mt: 1, fontSize: 13 }}
            >
              Available stock: {selectedStock}
            </Typography>
          )}
        </Box>
        <Box sx={{ mt: 2, p: 2, border: "1px solid #ddd", borderRadius: 2 }}>
          <Typography variant="h6">🛍 Shopping Cart ({cart.length})</Typography>
          <TableContainer
            sx={{ mt: 2, border: "1px solid #ddd", borderRadius: 2 }}
          >
            <Table size="small">
              {/* HEADER */}
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell align="center">Qty</TableCell>
                  <TableCell align="center">Unit Price</TableCell>
                  <TableCell align="center">Total</TableCell>
                  <TableCell align="center">Profit</TableCell>
                  <TableCell align="center">Action</TableCell>
                </TableRow>
              </TableHead>

              {/* BODY */}
              <TableBody>
                {cart.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      No items in cart
                    </TableCell>
                  </TableRow>
                ) : (
                  cart.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <b>{item.name}</b>
                        <div style={{ fontSize: 11, color: "#777" }}>
                          {item.breakdown}
                        </div>
                      </TableCell>
                      <TableCell align="center">
                        <TextField
                          type="number"
                          size="small"
                          value={item.qty}
                          onChange={(e) =>
                            updateQty(item.id, Number(e.target.value || 1))
                          }
                          sx={{ width: 70 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        ₹{Math.round(item.total / item.qty)}
                      </TableCell>
                      <TableCell align="center">₹{item.total}</TableCell>
                      <TableCell align="center">₹{item.profit}</TableCell>
                      <TableCell align="center">
                        <IconButton
                          color="error"
                          onClick={() => removeItem(item.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>{" "}
        </Box>
      </Box>

      {/* RIGHT SIDE */}
      <Box sx={{ flex: 1 }}>
        <Box sx={{ p: 2, border: "1px solid #ddd", borderRadius: 2 }}>
          <Typography>Subtotal: ₹{grandTotal}</Typography>

          {/* Tax */}
          <Box sx={{ display: "flex", alignItems: "center", mt: 1 }}>
            <Typography>Tax:</Typography>
            <TextField
              size="small"
              value={taxPercent}
              onChange={(e) => setTaxPercent(Number(e.target.value || 0))}
              sx={{ mx: 1, width: 80 }}
            />
          </Box>

          <Typography>Tax Amount: ₹{taxAmount}</Typography>

          {/* Discount */}
          <Box sx={{ display: "flex", alignItems: "center", mt: 1 }}>
            <Typography>Discount:</Typography>
            <TextField
              size="small"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value || 0))}
              sx={{ mx: 1, width: 80 }}
            />
          </Box>

          <Typography color="red">Discount: ₹{discountAmount}</Typography>

          <hr />

          <Typography variant="h5" color="green">
            Total: ₹{finalTotal}
          </Typography>
        </Box>
        <Box sx={{ mt: 2, p: 2, border: "1px solid #ddd", borderRadius: 2 }}>
          <Typography variant="h6">💳 Payment Details</Typography>

          {/* Payment Method */}
          <Box sx={{ mt: 1 }}>
            <label>
              <input
                type="radio"
                name="payment"
                checked={paymentMode === "cash"}
                onChange={() => setPaymentMode("cash")}
              />{" "}
              Cash
            </label>

            <label style={{ marginLeft: 20 }}>
              <input
                type="radio"
                name="payment"
                checked={paymentMode === "upi"}
                onChange={() => setPaymentMode("upi")}
              />{" "}
              UPI
            </label>
          </Box>

          {/* Customer Info */}
          <TextField
            fullWidth
            label="Customer Name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            sx={{ mt: 1 }}
          />
          <TextField
            fullWidth
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            sx={{ mt: 1 }}
          />
          <TextField
            fullWidth
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            sx={{ mt: 1 }}
          />

          {/* Actions */}
          <Button
            fullWidth
            variant="contained"
            color="success"
            sx={{ mt: 2 }}
            onClick={handleSaveAndPrint}
          >
            💾 Save & Print
          </Button>

          <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
            <Button fullWidth variant="outlined" onClick={handleSaveOnly}>
              Save Only
            </Button>

            <Button
              fullWidth
              color="success"
              variant="outlined"
              startIcon={<WhatsAppIcon />}
              onClick={handleSaveAndWhatsApp}
            >
              WhatsApp
            </Button>

            <Button
              fullWidth
              color="error"
              variant="contained"
              onClick={handleClearCart}
            >
              Clear Cart
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default Billing;
