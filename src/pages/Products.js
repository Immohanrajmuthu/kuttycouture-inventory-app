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
    { 
      field: "name", 
      headerName: "Product", 
      flex: 1.5, 
      minWidth: 200,
      headerAlign: "center",
      align: "left",
      renderCell: (params) => (
        <Box sx={{ py: 0.5 }}>
          {params.value}
        </Box>
      ),
    },
    {
      field: "sku",
      headerName: "SKU",
      flex: 0.85,
      minWidth: 90,
      headerAlign: "center",
      align: "center",
      valueGetter: (value, row) => row.sku || row.barcode || "-",
    },
    { 
      field: "category", 
      headerName: "Category", 
      flex: 0.9, 
      minWidth: 105,
      headerAlign: "center",
      align: "center",
    },

    {
      field: "quantity",
      headerName: "Stock",
      flex: 0.65,
      minWidth: 65,
      headerAlign: "center",
      align: "center",
      editable: true,
      renderCell: (params) => {
        const qty = Number(params.value ?? 0);
        const color = qty <= 0 ? "#DC2626" : qty <= Number(params.row?.minStock ?? 10) ? "#F59E0B" : "#16A34A";
        return <span style={{ color, fontWeight: 700 }}>{qty}</span>;
      },
    },

    {
      field: "price",
      headerName: "Purchase\nCost",
      flex: 0.85,
      minWidth: 90,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => {
        const price = Number(params.row?.price ?? 0);
        return `₹${price}`;
      },
    },
    {
      field: "sellingPrice",
      headerName: "Selling\nPrice",
      flex: 0.85,
      minWidth: 90,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => {
        const sellingPrice = Number(
          params.row?.sellingPrice ?? params.row?.pricing?.single ?? 0,
        );
        return `₹${sellingPrice}`;
      },
    },
    {
      field: "minStock",
      headerName: "Min\nStock",
      flex: 0.65,
      minWidth: 75,
      headerAlign: "center",
      align: "center",
      editable: true,
      renderCell: (params) => {
        const minStock = Number(params.row?.minStock ?? 0);
        const quantity = Number(params.row?.quantity ?? 0);
        if (quantity < minStock) {
          return (
            <span style={{ color: "#DC2626", fontWeight: 700 }}>
              ⚠ {minStock}
            </span>
          );
        }
        return <span style={{ color: "#334155", fontWeight: 600 }}>{minStock}</span>;
      },
    },
    {
      field: "pricingStatus",
      headerName: "Pricing",
      flex: 0.8,
      minWidth: 85,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => {
        const p = params.row;
        const hasPricing = Number(p?.sellingPrice ?? p?.pricing?.single ?? 0) > 0;

        return (
          <Box
            title={hasPricing ? "Selling price set" : "Selling price not set"}
            sx={{
              fontSize: 12,
              fontWeight: 700,
              color: hasPricing ? "#16A34A" : "#DC2626",
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
      flex: 1,
      minWidth: 150,
      sortable: false,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => {
        const row = params.row;

        return (
          <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", justifyContent: "center", height: "100%", width: "100%" }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setEditingProduct(row);
                navigate("/add-product");
              }}
              sx={{ textTransform: "none", borderRadius: 1, fontWeight: 600, fontSize: 11, px: 1.2, whiteSpace: "nowrap", minHeight: "32px" }}
            >
              Edit
            </Button>

            <Button
              size="small"
              color="error"
              variant="contained"
              onClick={() => {
                if (window.confirm(`Delete "${row.name}"?`)) {
                  handleDelete(row.id);
                }
              }}
              sx={{ textTransform: "none", borderRadius: 1, fontWeight: 600, fontSize: 11, px: 1.2, whiteSpace: "nowrap", minHeight: "32px" }}
            >
              Delete
            </Button>
          </Box>
        );
      },
    },
  ];

  const rows = filteredProducts.map((p) => ({
    id: p.id,
    ...p,
  }));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="h5" sx={{ mb: 0, fontWeight: 800, color: "#111827" }}>
        Inventory List
      </Typography>
      {rows.length === 0 && <Typography color="text.secondary">No products found</Typography>}
      <Box sx={{ display: "flex", gap: 2, mb: 1, flexWrap: "wrap" }}>
        <Box component="input"
          type="text"
          placeholder="Search products..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          sx={{
            width: "280px",
            maxWidth: "100%",
            p: 1.5,
            border: "1px solid #CBD5E1",
            borderRadius: 2,
            backgroundColor: "#FFFFFF",
            color: "#111827",
            fontSize: "0.95rem",
            outline: "none",
            boxShadow: "0 2px 8px rgba(15, 23, 42, 0.03)",
            "&:focus": { borderColor: "#3B82F6", boxShadow: "0 0 0 3px rgba(59,130,246,0.12)" },
          }}
        />

        <Box component="select"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          sx={{
            minWidth: "180px",
            p: 1.5,
            border: "1px solid #CBD5E1",
            borderRadius: 2,
            backgroundColor: "#FFFFFF",
            color: "#111827",
            fontSize: "0.95rem",
            outline: "none",
            boxShadow: "0 2px 8px rgba(15, 23, 42, 0.03)",
          }}
        >
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </Box>
      </Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, color: "#111827" }}>
          Products
        </Typography>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => navigate("/add-product")}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              px: 1.8,
              borderRadius: 2,
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
            sx={{ textTransform: "none", fontWeight: 700, px: 1.8, borderRadius: 2 }}
          >
            Export PDF
          </Button>
        </Box>
      </Box>
      <Box sx={{ height: 600, width: "100%", backgroundColor: "#FFFFFF", borderRadius: 0, overflow: "hidden" }}>
        <DataGrid
          sx={{
            border: "1px solid #E2E8F0",
            "& .MuiDataGrid-root": {
              backgroundColor: "#FFFFFF",
            },
            "& .highlight-row": {
              backgroundColor: "#fff3cd !important",
            },
            "& .MuiDataGrid-columnHeader": {
              backgroundColor: "#1F2A44 !important",
              color: "#FFFFFF !important",
              whiteSpace: "normal !important",
              wordWrap: "break-word !important",
            },
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: "#1F2A44 !important",
              color: "#fff !important",
              borderBottom: "2px solid #334155 !important",
              minHeight: "64px !important",
              maxHeight: "72px !important",
            },
            "& .MuiDataGrid-columnHeaderTitle": {
              fontWeight: 700,
              fontSize: 12,
              color: "#FFFFFF !important",
              overflow: "visible",
              whiteSpace: "pre-line",
              lineHeight: 1.2,
            },
            "& .MuiDataGrid-columnSeparator": {
              backgroundColor: "#334155",
            },
            "& .MuiDataGrid-sortingOrder": {
              color: "#FFFFFF !important",
            },
            "& .MuiDataGrid-columnHeader--sortable": {
              "&:hover": {
                backgroundColor: "#2A3A54 !important",
              },
            },
            "& .MuiDataGrid-iconButtonContainer": {
              visibility: "visible !important",
              color: "#FFFFFF !important",
            },
            "& .MuiDataGrid-iconSeparator": {
              display: "none",
            },
            "& .MuiDataGrid-cell": {
              borderBottom: "1px solid #E2E8F0",
              color: "#1F2937",
              fontSize: 13,
              padding: "10px 12px",
              whiteSpace: "normal !important",
              overflow: "visible !important",
              wordWrap: "break-word",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
            },
            "& .MuiDataGrid-cell[data-field='actions']": {
              padding: "4px 12px",
              justifyContent: "center",
            },
            "& .MuiDataGrid-row": {
              minHeight: "48px !important",
              maxHeight: "48px !important",
              "&:hover": {
                backgroundColor: "#F8FAFC !important",
              },
            },
            "& .MuiDataGrid-row--firstVisible": {
              backgroundColor: "#FAFBFC !important",
            },
            "& .MuiDataGrid-footerContainer": {
              borderTop: "1px solid #E2E8F0",
              backgroundColor: "#F8FAFC",
              minHeight: "52px",
            },
            "& .MuiDataGrid-virtualScroller": {
              overflowX: "hidden !important",
            },
          }}
          rows={rows}
          columns={columns}
          pageSizeOptions={[5, 10, 20]}
          initialState={{
            pagination: {
              paginationModel: {
                pageSize: 5,
              },
            },
          }}
          disableRowSelectionOnClick
          density="standard"
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
    </Box>
  );
};

export default Products;
