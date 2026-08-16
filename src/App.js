import React, { useState, useEffect, Suspense, lazy } from "react";
import Header from "./components/Header";
import { Typography } from "@mui/material";

import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { normalizeAppSettings } from "./utils/appSettings";

// Lazy load all page components for better startup performance
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const Billing = lazy(() => import("./pages/Billing"));
const StockAlert = lazy(() => import("./pages/StockAlert"));
const Settings = lazy(() => import("./pages/Settings"));
const AddProduct = lazy(() => import("./pages/AddProduct"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Reports = lazy(() => import("./pages/Reports"));
const Invoice = lazy(() => import("./pages/Invoice"));

// Loading fallback component
const LoadingFallback = () => (
  <div style={{
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    fontSize: "16px",
    color: "#666"
  }}>
    Loading...
  </div>
);

function App() {
  const [products, setProducts] = useState([]);
  const [bills, setBills] = useState([]);
  const [settings, setSettings] = useState(normalizeAppSettings());
  const [isLoaded, setIsLoaded] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);

  const [editingProduct, setEditingProduct] = useState(null);

  useEffect(() => {
 const loadData = async () => {
  try {
    if (!window.electronAPI?.getData) {
      throw new Error("The Electron desktop bridge is unavailable.");
    }

    const data = await window.electronAPI.getData();
    setProducts(data.products || []);
    setBills(data.bills || []);
    const loadedSettings = normalizeAppSettings(data.settings);
    setSettings(loadedSettings);
    setIsFirstLaunch(!loadedSettings.hasCompletedSetup);

    setIsLoaded(true);

  } catch (err) {
    console.error("Load error:", err);
  }
};

  loadData();
}, []);

 useEffect(() => {
  if (!isLoaded) return;

  window.electronAPI.setData("products", products);
}, [products, isLoaded]);

useEffect(() => {
  if (!isLoaded) return;

  window.electronAPI.setData("bills", bills);
}, [bills, isLoaded]);

useEffect(() => {
  if (!isLoaded) return;

  window.electronAPI.setData("settings", settings);
}, [settings, isLoaded]);

  return (
    <Router>
      {isLoaded && <Header settings={settings} />}

      <div style={{ padding: "20px" }}>
        {!isLoaded ? (
          <LoadingFallback />
        ) : (
          <Suspense fallback={<LoadingFallback />}>
            {isFirstLaunch ? (
              // First Launch: Show only Settings page with a message
              <div>
                <div style={{ 
                  backgroundColor: "#fff3cd", 
                  border: "1px solid #ffc107", 
                  padding: "16px", 
                  borderRadius: "4px",
                  marginBottom: "20px"
                }}>
                  <Typography variant="h6" style={{ color: "#856404" }}>
                    Welcome! Please configure your settings to get started
                  </Typography>
                </div>
                <Settings
                  products={products}
                  bills={bills}
                  settings={settings}
                  setSettings={setSettings}
                  isFirstLaunch={true}
                  onSetupComplete={() => setIsFirstLaunch(false)}
                />
              </div>
            ) : (
              // Normal: Show all routes
              <Routes>
                <Route path="/" element={<Dashboard products={products} bills={bills} />} />
          <Route
            path="/add-product"
            element={
              <AddProduct
                products={products}
                setProducts={setProducts}
                editingProduct={editingProduct}
                setEditingProduct={setEditingProduct}
                settings={settings}
              />
            }
          />
          <Route
            path="/products"
            element={
              <Products
                products={products}
                setProducts={setProducts}
                editingProduct={editingProduct}
                setEditingProduct={setEditingProduct}
              />
            }
          />
          <Route
            path="/pricing"
            element={<Pricing products={products} setProducts={setProducts} />}
          />
          <Route
            path="/billing"
            element={
              <Billing
                products={products}
                setProducts={setProducts}
                bills={bills}
                setBills={setBills}
                settings={settings}
              />
            }
          />
          <Route
            path="/reports"
            element={
              <Reports
                bills={bills}
                setBills={setBills}
                settings={settings}
              />
            }
          />
          <Route path="/alerts" element={<StockAlert products={products} />} />
          <Route
            path="/settings"
            element={
              <Settings
                products={products}
                bills={bills}
                settings={settings}
                setSettings={setSettings}
              />
            }
          />
          <Route path="/invoice" element={<Invoice settings={settings} />} />
              </Routes>
            )}
          </Suspense>
        )}
      </div>
    </Router>
  );
}
export default App;
