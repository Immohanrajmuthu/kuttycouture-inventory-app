import React, { useState } from "react";
import { DataGrid } from "@mui/x-data-grid";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useNavigate } from "react-router-dom";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import AddIcon from "@mui/icons-material/Add";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { exportProductsToPDF } from "../utils/exportPDF";

const Products = ({ products, setProducts, setEditingProduct, settings }) => {
  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [updatedRowId, setUpdatedRowId] = useState(null);
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const categories = [
    "All",
    ...new Set(products.map((p) => p.category || "No Category")),
  ];
  const filteredProducts = products.filter((p) => {
    const searchMatch =
      p.name?.toLowerCase().includes(searchText.toLowerCase()) ||
      p.sku?.toLowerCase().includes(searchText.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(searchText.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchText.toLowerCase());

    const categoryMatch =
      selectedCategory === "All" || p.category === selectedCategory;

    return searchMatch && categoryMatch;
  });
  const handleDelete = (id) => {
    setProducts(products.filter((p) => p.id !== id));
  };

  const handleExportProducts = () => {
    if (!exportProductsToPDF(filteredProducts, settings)) {
      alert("There are no products to export.");
    }
  };

  const navigate = useNavigate();

  const columns = [
    { field: "name", headerName: "Product", flex: 1 },
    {
      field: "sku",
      headerName: "SKU",
      flex: 1,
      valueGetter: (value, row) => row.sku || row.barcode || "-",
    },
    { field: "category", headerName: "Category", flex: 1 },

    {
      field: "quantity",
      headerName: "Stock",
      width: 100,
      editable: true,
    },

    {
      field: "price",
      headerName: "Purchase Cost",
      width: 120,
      renderCell: (params) => {
        const price = Number(params.row?.price ?? 0);
        return `₹${price}`;
      },
    },
    {
      field: "sellingPrice",
      headerName: "Selling Price",
      width: 120,
      renderCell: (params) => {
        const sellingPrice = Number(
          params.row?.sellingPrice ?? params.row?.pricing?.single ?? 0,
        );
        return `${sellingPrice}`;
      },
    },
    {
      field: "minStock",
      headerName: "Min Stock",
      width: 120,
      editable: true,
      renderCell: (params) => {
        const minStock = Number(params.row?.minStock ?? 0);
        const quantity = Number(params.row?.quantity ?? 0);
        if (quantity < minStock) {
          return (
            <span style={{ color: "red", fontWeight: "bold" }}>
              ⚠ {minStock}
            </span>
          );
        }
        return minStock;
      },
    },
    {
      field: "pricingStatus",
      headerName: "Pricing",
      width: 150,
      renderCell: (params) => {
        const p = params.row;
        const hasPricing = Number(p?.sellingPrice ?? p?.pricing?.single ?? 0) > 0;

        return (
          <Box
            title={hasPricing ? "Selling price set" : "Selling price not set"}
            sx={{
              px: 1,
              py: 0.5,
              borderRadius: 1,
              fontSize: 12,
              fontWeight: 600,
              textAlign: "center",
              cursor: "pointer", // 🔥 important

              backgroundColor: hasPricing ? "#e8f5e9" : "#ffebee",
              color: hasPricing ? "#2e7d32" : "#c62828",

              "&:hover": {
                opacity: 0.8,
                transform: "scale(1.05)",
              },
            }}
          >
            {hasPricing ? "Priced" : "Not Priced"}
          </Box>
        );
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 180,
      renderCell: (params) => {
        const row = params.row;

        return (
          <>
            <Button
              size="small"
              onClick={() => {
                setEditingProduct(row);
                navigate("/add-product");
              }}
            >
              Edit
            </Button>

            <Button
              size="small"
              color="error"
              onClick={() => {
                if (window.confirm(`Delete "${row.name}"?`)) {
                  handleDelete(row.id);
                }
              }}
            >
              Delete
            </Button>
          </>
        );
      },
    },
  ];

  const rows = filteredProducts.map((p) => ({
    id: p.id,
    ...p,
  }));

  return (
    <div>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Inventory List
      </Typography>
      {rows.length === 0 && <p>No products found</p>}
      <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search products..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ padding: "8px", width: "250px" }}
        />

        {/* Category Filter */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{ padding: "8px" }}
        >
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center", // 🔥 IMPORTANT FIX
          mb: 2,
        }}
      >
        {/* Left side (optional title) */}
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Products
        </Typography>

        <Box sx={{ display: "flex", gap: 1 }}>
          {/* Add Product */}
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => navigate("/add-product")}
            sx={{
              textTransform: "none",
              fontWeight: 500,
              px: 1.5,
            }}
          >
            Add Product
          </Button>

          <Button
            variant="outlined"
            size="small"
            startIcon={<PictureAsPdfIcon />}
            onClick={handleExportProducts}
            disabled={filteredProducts.length === 0}
            sx={{ textTransform: "none", fontWeight: 500, px: 1.5 }}
          >
            Export PDF
          </Button>
        </Box>
      </Box>
      <Box sx={{ height: 500, width: "100%" }}>
        <DataGrid
          sx={{
            "& .highlight-row": {
              backgroundColor: "#fff3cd !important",
            },
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: "#1976d2",
              color: "#fff",
              borderBottom: "1px solid #96bcdb",
            },

            "& .MuiDataGrid-columnHeaderTitle": {
              fontWeight: 600,
              fontSize: 13,
              color: "#333",
            },
          }}
          rows={rows}
          columns={columns}
          pageSize={5}
          rowsPerPageOptions={[5, 10, 20]}
          disableRowSelectionOnClick
          processRowUpdate={(newRow) => {
            setProducts((prev) =>
              prev.map((p) => (p.id === newRow.id ? newRow : p)),
            );

            setUpdatedRowId(newRow.id);
            setOpenSnackbar(true);

            setTimeout(() => {
              setUpdatedRowId(null);
            }, 1500);

            return newRow;
          }}
          getRowClassName={(params) =>
            params.id === updatedRowId ? "highlight-row" : ""
          }
        />
        <Snackbar
          open={openSnackbar}
          autoHideDuration={2000}
          onClose={() => setOpenSnackbar(false)}
        >
          <Alert severity="success" variant="filled">
            Stock updated successfully!
          </Alert>
        </Snackbar>
      </Box>
    </div>
  );
};

export default Products;
