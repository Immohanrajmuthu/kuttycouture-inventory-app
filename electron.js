const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const Store = require("electron-store");

let store;
let mainWindow;

function getDefaultStoragePath() {
  return path.join(app.getPath("appData"), "Kutty Couture Inventory");
}

// Initialize store at the correct location
function initializeStore() {
  const defaultStoragePath = getDefaultStoragePath();
  const storagePointerFile = path.join(defaultStoragePath, ".storage-config");
  
  let activePath = defaultStoragePath;
  
  // Check if a custom storage pointer file exists
  try {
    if (fs.existsSync(storagePointerFile)) {
      const customPath = fs.readFileSync(storagePointerFile, "utf8").trim();
      if (customPath && fs.existsSync(customPath)) {
        activePath = customPath;
        console.log(`Using custom storage path: ${activePath}`);
      } else {
        console.log(`Custom storage path invalid, using default: ${defaultStoragePath}`);
        // Clean up invalid pointer
        try { fs.unlinkSync(storagePointerFile); } catch (e) {}
      }
    } else {
      console.log(`Using default storage path: ${defaultStoragePath}`);
    }
  } catch (err) {
    console.error("Error reading storage config:", err);
    activePath = defaultStoragePath;
  }
  
  // Set userData path for Electron
  app.setPath("userData", activePath);
  
  // Create store at the active location
  store = new Store({ cwd: activePath });
  
  return store;
}

// Initialize store before window creation
initializeStore();

process.on("uncaughtException", (error) => {
  console.error("UNCAUGHT EXCEPTION:", error);
});

app.on("ready", () => {
  console.log("Electron ready event fired");
});

console.log("Preload path:", path.join(__dirname, "preload.js"));


function createWindow() {
  const iconPath = path.join(__dirname, "build", "appIcon.ico");

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    title: "Kutty Couture Inventory",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow
    .loadFile(path.join(__dirname, "build", "index.html"))
    .catch((err) => console.error("LOAD ERROR:", err));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

console.log("UserData path:", app.getPath("userData"));

app
  .whenReady()
  .then(() => {
    console.log("App is ready");
    createWindow();
  })
  .catch((err) => {
    console.error("APP READY ERROR:", err);
  });

// ✅ Storage IPC
ipcMain.handle("get-data", (event, key) => {
  if (!key) return store.store;
  return store.get(key);
});

ipcMain.handle("set-data", (event, key, value) => {
   console.log("Writing to store:", key);
  if (!key) return;
  store.set(key, value);
});

ipcMain.handle("select-export-folder", async () => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled) return "";
  return result.filePaths[0] || "";
});

ipcMain.handle("save-file", async (event, { directory, fileName, base64Data, textData }) => {
  if (!fileName || (!base64Data && textData === undefined)) return false;

  let targetPath = directory ? path.join(directory, fileName) : "";
  if (!targetPath) {
    const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow(), {
      defaultPath: fileName,
    });
    if (result.canceled || !result.filePath) return false;
    targetPath = result.filePath;
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(
    targetPath,
    textData === undefined ? Buffer.from(base64Data, "base64") : textData,
    textData === undefined ? undefined : "utf8",
  );

  return targetPath;
});

// ✅ Print
ipcMain.handle("print-invoice", () => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;

  win.webContents.print({
    silent: false,
    printBackground: true,
  });
});

// ✅ Data Storage Location Management
ipcMain.handle("select-data-storage-folder", async () => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
    message: "Select a folder to store your inventory data (products, bills, settings)",
  });

  if (result.canceled) return "";
  return result.filePaths[0] || "";
});

ipcMain.handle("migrate-data-to-location", async (event, newStoragePath) => {
  try {
    if (!newStoragePath) return { success: false, message: "Invalid path" };

    // Get current data from existing store
    const products = store.get("products") || [];
    const bills = store.get("bills") || [];
    const settings = store.get("settings") || {};

    // Ensure new directory exists
    await fs.promises.mkdir(newStoragePath, { recursive: true });

    // Create a new store at the new location
    const newStore = new Store({
      cwd: newStoragePath,
    });

    // Update settings to record the custom storage path
    const updatedSettings = {
      ...settings,
      dataStoragePath: newStoragePath,
    };

    // Write data to new store
    newStore.set("products", products);
    newStore.set("bills", bills);
    newStore.set("settings", updatedSettings);

    // Create a pointer file at default location that points to the new location
    // This is more reliable than using electron-store for this purpose
    const defaultStoragePath = getDefaultStoragePath();
    await fs.promises.mkdir(defaultStoragePath, { recursive: true });
    const storagePointerFile = path.join(defaultStoragePath, ".storage-config");
    await fs.promises.writeFile(storagePointerFile, newStoragePath, "utf8");

    console.log(`Data migrated to: ${newStoragePath}`);
    console.log(`Pointer file created at: ${storagePointerFile}`);
    
    return { 
      success: true, 
      message: `Data successfully moved to ${newStoragePath}. Please restart the application.` 
    };
  } catch (err) {
    console.error("Migration error:", err);
    return { success: false, message: `Migration failed: ${err.message}` };
  }
});

ipcMain.handle("get-current-storage-path", () => {
  return app.getPath("userData");
});

ipcMain.handle("get-storage-path-info", () => {
  const defaultStoragePath = getDefaultStoragePath();
  const currentStoragePath = app.getPath("userData");

  return {
    defaultStoragePath,
    currentStoragePath,
    isCustomStoragePath: currentStoragePath !== defaultStoragePath,
  };
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
