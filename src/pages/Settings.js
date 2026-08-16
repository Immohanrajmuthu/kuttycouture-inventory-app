import React, { useEffect, useState } from "react";
import { Box, Typography, Button, TextField, IconButton } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { normalizeAppSettings } from "../utils/appSettings";

const Settings = ({ products, bills, settings, setSettings, isFirstLaunch = false, onSetupComplete = () => {} }) => {
  const [draft, setDraft] = useState(normalizeAppSettings(settings));
  const [newCategory, setNewCategory] = useState("");
  const [currentStoragePath, setCurrentStoragePath] = useState("");
  const [defaultStoragePath, setDefaultStoragePath] = useState("");
  const [isCustomStoragePath, setIsCustomStoragePath] = useState(false);
  const [selectedStoragePath, setSelectedStoragePath] = useState("");
  const [isMigrating, setIsMigrating] = useState(false);

  useEffect(() => {
    setDraft(normalizeAppSettings(settings));
  }, [settings]);

  // Fetch current storage path on component mount
  useEffect(() => {
    const getStoragePath = async () => {
      if (window.electronAPI?.invoke) {
        try {
          if (window.electronAPI.invoke) {
            const storageInfo = await window.electronAPI.invoke("get-storage-path-info");
            setDefaultStoragePath(storageInfo.defaultStoragePath || "");
            setCurrentStoragePath(storageInfo.currentStoragePath || "");
            setIsCustomStoragePath(Boolean(storageInfo.isCustomStoragePath));
          }
        } catch (err) {
          try {
            const path = await window.electronAPI.invoke("get-current-storage-path");
            setCurrentStoragePath(path);
          } catch (fallbackErr) {
            console.error("Error fetching storage path:", fallbackErr);
          }
        }
      }
    };
    getStoragePath();
  }, []);

  const updateDraft = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddCategory = () => {
    if (newCategory.trim() && !draft.categories.includes(newCategory)) {
      setDraft((prev) => ({
        ...prev,
        categories: [...prev.categories, newCategory],
      }));
      setNewCategory("");
    }
  };

  const handleDeleteCategory = (category) => {
    if (category === "No Category") {
      alert("Cannot delete the default category");
      return;
    }
    setDraft((prev) => ({
      ...prev,
      categories: prev.categories.filter((c) => c !== category),
    }));
  };

  const handleSaveSettings = () => {
    // Validation for first launch
    if (isFirstLaunch) {
      if (!draft.shopName.trim()) {
        alert("Please enter your shop name");
        return;
      }
      if (!draft.shopPhone.trim()) {
        alert("Please enter your shop phone");
        return;
      }
    }

    const updatedSettings = normalizeAppSettings({
      ...draft,
      hasCompletedSetup: true, // Mark setup as complete
    });

    setSettings(updatedSettings);

    if (isFirstLaunch) {
      alert("Setup complete! You can now use the application.");
      onSetupComplete();
    } else {
      alert("Settings saved. Please restart the application to apply everywhere.");
    }
  };

  const handleChooseExportFolder = async () => {
    if (!window.electronAPI?.selectExportFolder) {
      alert("Folder selection is available only in the desktop app.");
      return;
    }

    const folder = await window.electronAPI.selectExportFolder();
    if (folder) updateDraft("exportPath", folder);
  };

  const handleSelectDataStorageFolder = async () => {
    if (!window.electronAPI?.invoke) {
      alert("Custom data storage location is available only in the desktop app.");
      return;
    }

    try {
      const folder = await window.electronAPI.invoke(
        "select-data-storage-folder"
      );
      if (folder) {
        setSelectedStoragePath(folder);
      }
    } catch (err) {
      alert("Error selecting folder: " + err.message);
    }
  };

  const handleMigrateDataStorage = async () => {
    if (!selectedStoragePath) {
      alert("Please select a folder first");
      return;
    }

    if (
      !window.confirm(
        "This will move all your data (products, bills, settings) to the new location. Continue?"
      )
    ) {
      return;
    }

    setIsMigrating(true);
    try {
      const result = await window.electronAPI.invoke(
        "migrate-data-to-location",
        selectedStoragePath
      );

      if (result.success) {
        alert(result.message);
        setSelectedStoragePath("");
        setCurrentStoragePath(selectedStoragePath);
        setIsCustomStoragePath(true);
      } else {
        alert("Migration failed: " + result.message);
      }
    } catch (err) {
      alert("Error migrating data: " + err.message);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleLogoUpload = (file) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => updateDraft("billLogo", e.target.result);
    reader.readAsDataURL(file);
  };

  // Export Backup
  const handleExport = async () => {
    const storedProducts = await window.electronAPI.getData("products");
    const storedBills = await window.electronAPI.getData("bills");
    const storedSettings = await window.electronAPI.getData("settings");
    const backup = {
      products: storedProducts,
      bills: storedBills,
      settings: storedSettings,
      date: new Date().toISOString(),
    };

    await window.electronAPI.saveFile({
      directory: draft.exportPath,
      fileName: `backup_${Date.now()}.json`,
      textData: JSON.stringify(backup, null, 2),
    });
  };

  // Import Backup
  const handleImport = (file) => {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);

        await window.electronAPI.setData("products", data.products || []);
        await window.electronAPI.setData("bills", data.bills || []);
        await window.electronAPI.setData(
          "settings",
          normalizeAppSettings(data.settings),
        );

        alert("Backup restored successfully!");
        window.location.reload();
      } catch (err) {
        alert("Invalid backup file");
      }
    };

    reader.readAsText(file);
  };

  return (
   <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Settings
      </Typography>

      <Box sx={{ display: "flex", gap: 3, alignItems: "flex-start" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
          <Box
            sx={{
              mt: 2,
              p: 3,
              border: "1px solid #ddd",
              borderRadius: 2,
            }}
          >
            <Typography variant="h6">Shop Details</Typography>

            <TextField
              fullWidth
              label="Shop Name"
              value={draft.shopName}
              onChange={(e) => updateDraft("shopName", e.target.value)}
              sx={{ mt: 2 }}
            />
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Shop Address"
              value={draft.shopAddress}
              onChange={(e) => updateDraft("shopAddress", e.target.value)}
              sx={{ mt: 2 }}
            />
            <TextField
              fullWidth
              label="Email"
              value={draft.shopEmail}
              onChange={(e) => updateDraft("shopEmail", e.target.value)}
              sx={{ mt: 2 }}
            />
            <TextField
              fullWidth
              label="Phone"
              value={draft.shopPhone}
              onChange={(e) => updateDraft("shopPhone", e.target.value)}
              sx={{ mt: 2 }}
            />

            <Box sx={{ mt: 2 }}>
              <Button variant="outlined" component="label">
                Upload App Logo
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e) => handleLogoUpload(e.target.files[0])}
                />
              </Button>
              {draft.billLogo && (
                <Box sx={{ mt: 2 }}>
                  <img
                    src={draft.billLogo}
                    alt="Bill logo preview"
                    style={{ maxWidth: 160, maxHeight: 80, objectFit: "contain" }}
                  />
                </Box>
              )}
            </Box>
          </Box>

          {!isFirstLaunch && (
            <Box
              sx={{
                p: 3,
                border: "1px solid #ddd",
                borderRadius: 2,
              }}
            >
              <Typography variant="h6">Product Categories</Typography>

            <Box sx={{ mt: 2 }}>
              <Typography sx={{ fontSize: 14, mb: 1 }}>Current Categories:</Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
                {draft.categories.map((category) => (
                  <Box
                    key={category}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      px: 2,
                      py: 0.5,
                      backgroundColor: "#e3f2fd",
                      borderRadius: 1,
                      border: "1px solid #90caf9",
                    }}
                  >
                    <Typography sx={{ fontSize: 14 }}>{category}</Typography>
                    {category !== "No Category" && (
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteCategory(category)}
                        sx={{ ml: 1, p: 0 }}
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>

            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField
                label="New Category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddCategory()}
                size="small"
                sx={{ flex: 1 }}
                placeholder="e.g., Shorts, Tops"
              />
              <Button variant="outlined" onClick={handleAddCategory}>
                Add
              </Button>
            </Box>
          </Box>
          )}
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
          {!isFirstLaunch && (
            <><Box
                sx={{
                  mt: 2,
                  p: 3,
                  border: "1px solid #ddd",
                  borderRadius: 2,
                  maxWidth: 520,
                }}
              >
                <Typography variant="h6">Export Location</Typography>
                <TextField
                  fullWidth
                  label="Invoice / Reports Save Folder"
                  value={draft.exportPath}
                  InputProps={{ readOnly: true }}
                  sx={{ mt: 2 }}
                  placeholder="Not set - choose a file location when exporting" />
                {!draft.exportPath && (
                  <Typography sx={{ mt: 1, fontSize: 12, color: "#777" }}>
                    No default folder is set. The desktop app will ask where to save each export.
                  </Typography>
                )}
                <Button
                  fullWidth
                  variant="outlined"
                  sx={{ mt: 2 }}
                  onClick={handleChooseExportFolder}
                >
                  Select Folder
                </Button>
                <Typography sx={{ mt: 1, fontSize: 12, color: "#777" }}>
                  Exports are saved by the Windows desktop app.
                </Typography>
              </Box><Box
                sx={{
                  p: 3,
                  border: "1px solid #ddd",
                  borderRadius: 2,
                  maxWidth: 520,
                }}
              >
                  <Typography variant="h6">Data Storage Location</Typography>
                  <TextField
                    fullWidth
                    label="Default Storage Path"
                    value={defaultStoragePath || "Default (AppData\\Kutty Couture Inventory)"}
                    InputProps={{ readOnly: true }}
                    sx={{ mt: 2 }}
                    size="small" />
                  <Typography sx={{ mt: 1, fontSize: 12, color: "#777" }}>
                    New installations start here unless a custom storage location is selected.
                  </Typography>

                  {isCustomStoragePath && (
                    <>
                      <TextField
                        fullWidth
                        label="Current Custom Storage Path"
                        value={currentStoragePath}
                        InputProps={{ readOnly: true }}
                        sx={{ mt: 2 }}
                        size="small" />
                      <Typography sx={{ mt: 1, fontSize: 12, color: "#777" }}>
                        This installation is currently using the custom location above.
                      </Typography>
                    </>
                  )}

                  {selectedStoragePath && (
                    <Box sx={{ mt: 2, p: 2, backgroundColor: "#f5f5f5", borderRadius: 1 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 500 }}>
                        Selected new location:
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: "#666", mt: 0.5 }}>
                        {selectedStoragePath}
                      </Typography>
                    </Box>
                  )}

                  <Button
                    fullWidth
                    variant="outlined"
                    sx={{ mt: 2 }}
                    onClick={handleSelectDataStorageFolder}
                  >
                    Choose New Storage Location
                  </Button>

                  {selectedStoragePath && (
                    <Button
                      fullWidth
                      variant="contained"
                      color="warning"
                      sx={{ mt: 2 }}
                      onClick={handleMigrateDataStorage}
                      disabled={isMigrating}
                    >
                      {isMigrating ? "Migrating..." : "Migrate Data to New Location"}
                    </Button>
                  )}

                  <Typography sx={{ mt: 2, fontSize: 12, color: "#777" }}>
                    ⚠️ Desktop app feature only. This allows you to store your data on
                    an external drive, cloud sync folder, or custom location.
                  </Typography>
                </Box><Box
                  sx={{
                    p: 3,
                    border: "1px solid #ddd",
                    borderRadius: 2,
                    maxWidth: 520,
                  }}
                >
                  <Typography variant="h6">Backup & Restore</Typography>

                  <Button
                    fullWidth
                    variant="contained"
                    sx={{ mt: 2 }}
                    onClick={handleExport}
                  >
                    Export Backup
                  </Button>

                  <Button fullWidth variant="outlined" component="label" sx={{ mt: 2 }}>
                    Import Backup
                    <input
                      type="file"
                      hidden
                      accept="application/json"
                      onChange={(e) => handleImport(e.target.files[0])} />
                  </Button>

                  <Typography sx={{ mt: 2, fontSize: 12, color: "#777" }}>
                    Please keep backup file safe. Import will overwrite existing data.
                  </Typography>
                </Box></>
          )}
        </Box>
      </Box>

      <Box sx={{ mt: 4, display: "flex", gap: 2, justifyContent: "center" }}>
        <Button
          variant="contained"
          size="large"
          onClick={handleSaveSettings}
          sx={{ minWidth: 200 }}
        >
          {isFirstLaunch ? "Complete Setup" : "Save Settings"}
        </Button>
      </Box>

      {/* About Section */}
      <Box
        sx={{
          mt: 4,
          p: 3,
          backgroundColor: "#f5f5f5",
          border: "1px solid #ddd",
          borderRadius: 2,
          maxWidth: 600,
          margin: "40px auto 0",
        }}
      >
        <Typography variant="h6" gutterBottom>
          About This Application
        </Typography>
        <Box sx={{ mt: 2, fontSize: "14px", lineHeight: 1.8, color: "#666" }}>
          <Box sx={{ mb: 1 }}>
            <strong>Application Name:</strong> Kutty Couture Inventory Manager
          </Box>
          <Box sx={{ mb: 1 }}>
            <strong>Version:</strong> 1.0.0
          </Box>
          <Box sx={{ mb: 1 }}>
            <strong>Purpose:</strong> Complete inventory, billing, and reporting
            solution for retail businesses
          </Box>
          <Box sx={{ mb: 1 }}>
            <strong>Developer:</strong> Kutty Couture Team
          </Box>
          <Box sx={{ mb: 1 }}>
            <strong>Features:</strong> Product management, billing, inventory
            tracking, reports, and data backup
          </Box>
          <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid #ddd" }}>
            <Typography sx={{ fontSize: "12px", color: "#999" }}>
              © 2026 Kutty Couture. All rights reserved.
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default Settings;
