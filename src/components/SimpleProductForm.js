import React, { useState, useEffect } from "react";
import { TextField, Button, MenuItem, Box } from "@mui/material";

const SimpleProductForm = ({ onSave, editingProduct, categories = ["No Category", "Jabla", "Frock", "Set"] }) => {
  const [product, setProduct] = useState({
    name: "",
    sku: "",
    quantity: 0,
    price: 0,
    sellingPrice: 0,
    category: "No Category",
    minStock: 0,
  });

  useEffect(() => {
    if (editingProduct) {
      setProduct({
        name: editingProduct.name || "",
        sku: editingProduct.sku || editingProduct.barcode || "",
        quantity: editingProduct.quantity || 0,
        price: editingProduct.price || 0,
        sellingPrice:
          editingProduct.sellingPrice ?? editingProduct.pricing?.single ?? 0,
        category: editingProduct.category || categories[0] || "No Category",
        minStock: editingProduct.minStock || 0,
      });
    } else {
      // Ensure category is valid when categories change
      setProduct((prev) => {
        const validCategory = categories.includes(prev.category)
          ? prev.category
          : categories[0] || "No Category";
        return { ...prev, category: validCategory };
      });
    }
  }, [editingProduct, categories]);

  const handleChange = (e) => {
    setProduct({ ...product, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const newErrors = {};

    if (!product.name.trim()) {
      newErrors.name = "Product name is required";
    }

    if (product.quantity !== "" && product.quantity < 0) {
      newErrors.quantity = "Quantity cannot be negative";
    }

    if (product.price !== "" && product.price < 0) {
      newErrors.price = "Price cannot be negative";
    }

    if (product.sellingPrice !== "" && product.sellingPrice < 0) {
      newErrors.sellingPrice = "Selling price cannot be negative";
    }

    if (product.minStock !== "" && product.minStock < 0) {
      newErrors.minStock = "Minimum stock cannot be negative";
    }

    if (Object.keys(newErrors).length > 0) return;

    const sellingPrice = Number(product.sellingPrice || 0);

    onSave({
      ...product,
      quantity: Number(product.quantity || 0),
      price: Number(product.price || 0),
      sellingPrice,
      minStock: Number(product.minStock || 0),
      // Temporary compatibility for Billing until it is migrated to sellingPrice.
      pricing: { ...editingProduct?.pricing, single: sellingPrice },
    });

    setProduct({
      name: "",
      sku: "",
      quantity: "",
      price: "",
      sellingPrice: "",
      category: "No Category",
      minStock: "",
      pricing: {
        single: 0,
        packs: { 2: 0, 3: 0, 5: 0, 10: 0 },
      },
    });
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{ maxWidth: 500, mx: "auto", my: 1, p: 2, backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 1 }}
    >
      <TextField
        label="Product Name"
        name="name"
        value={product.name}
        onChange={handleChange}
        fullWidth
        margin="dense"
        required
      />

      <TextField
        label="SKU"
        name="sku"
        value={product.sku}
        onChange={handleChange}
        fullWidth
        margin="dense"
      />

      <TextField
        label="Quantity"
        name="quantity"
        type="number"
        value={product.quantity || ""}
        onChange={handleChange}
        fullWidth
        margin="dense"
      />

      <Box sx={{ display: "flex", gap: 2 }}>
        <TextField
          label="Purchase Cost"
          name="price"
          type="number"
          value={product.price || ""}
          onChange={handleChange}
          fullWidth
          margin="dense"
        />

        <TextField
          label="Selling Price"
          name="sellingPrice"
          type="number"
          value={product.sellingPrice || ""}
          onChange={handleChange}
          fullWidth
          margin="dense"
        />
      </Box>

      <TextField
        select
        label="Category"
        name="category"
        value={product.category}
        onChange={handleChange}
        fullWidth
        margin="dense"
      >
        {categories.map((cat) => (
          <MenuItem key={cat} value={cat}>
            {cat}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        label="Minimum Stock"
        name="minStock"
        type="number"
        value={product.minStock || ""}
        onChange={handleChange}
        fullWidth
        margin="dense"
      />

      <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }}>
        Save Product
      </Button>
    </Box>
  );
};

export default SimpleProductForm;
