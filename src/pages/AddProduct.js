import React, { useState, useEffect } from "react";
import SimpleProductForm from "../components/SimpleProductForm";
import { useNavigate } from "react-router-dom";
import { Snackbar, Alert, Box, Typography } from "@mui/material";

const AddProduct = ({
  products,
  setProducts,
  editingProduct,
  setEditingProduct,
  settings,
}) => {
  const handleSave = (product) => {
    const editing = !!editingProduct;

    if (editing) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingProduct.id
            ? {
                ...p,
                ...product,
                id: p.id,
              }
            : p,
        ),
      );
      setEditingProduct(null);
    } else {
      setProducts((prev) => [...prev, { ...product, id: Date.now() }]);
    }

    setIsEditMode(editing);
    setOpenSnackbar(true);
  };
  const navigate = useNavigate();
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  useEffect(() => {
    if (!editingProduct && openSnackbar) {
      const timer = setTimeout(() => {
        navigate("/products");
      }, 1500); // wait for message

      return () => clearTimeout(timer);
    }
  }, [editingProduct, openSnackbar, navigate]);
  return (
    <Box sx={{ p: 2, pb: 1 }}>
      {editingProduct && (
        <Typography variant="body2" sx={{ color: "#16A34A", fontWeight: 600, mb: 0.5 }}>
          ✏ Editing: {editingProduct.name}
        </Typography>
      )}

      <Typography variant="h5" sx={{ fontWeight: 800, color: "#111827", mb: 1.5 }}>
        {editingProduct ? "Edit Product" : "Add New Product"}
      </Typography>

      <SimpleProductForm 
        onSave={handleSave} 
        editingProduct={editingProduct}
        categories={settings?.categories || ["No Category", "Jabla", "Frock", "Set"]}
      />
      <Snackbar
        open={openSnackbar}
        autoHideDuration={3000}
        onClose={() => setOpenSnackbar(false)}
      >
        <Alert severity="success" variant="filled">
          {isEditMode
            ? "Product updated successfully!"
            : "Product added successfully!"}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AddProduct;
