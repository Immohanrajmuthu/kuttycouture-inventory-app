# Kutty Couture Inventory

A Windows desktop app for a small retail shop to manage products, record sales, track stock, and export invoices and reports. React and Material UI provide the interface inside Electron. Business data stays in a local JSON store; this repository has no backend server, database service, login, or cloud synchronization.

This guide describes the current implementation and is the starting point for new contributors.

## Contents

- [Run the app](#run-the-app)
- [Website catalog import](#website-catalog-import)
- [Main workflows](#main-workflows)
- [Architecture and source map](#architecture-and-source-map)
- [Data model and calculations](#data-model-and-calculations)
- [Storage, backups, and migration](#storage-backups-and-migration)
- [Development and verification](#development-and-verification)
- [Windows packaging and CI](#windows-packaging-and-ci)
- [Known implementation gaps](#known-implementation-gaps)
- [Troubleshooting](#troubleshooting)
- [Other documentation](#other-documentation)

## Run the app

### Prerequisites

- Windows for running and validating the intended desktop distribution.
- Git, Node.js, and npm. The checked-in CI workflow uses **Node 20**; the repository does not declare a Node `engines` requirement or provide a version-manager file.
- Network access for dependency installation. Core inventory and billing work locally; WhatsApp sharing requires internet access.

From a new checkout:

```powershell
git clone https://github.com/Immohanrajmuthu/kuttycouture-inventory-app.git
cd kuttycouture-inventory-app
npm ci
npm run desktop
```

`npm run desktop` builds React into `build/`, then starts Electron using those files. No `.env` file, API keys, or database setup is required.

On first launch, enter a shop name and phone number in Settings and choose **Complete Setup**. Then configure categories, the shop logo, and export locations from Settings.

**Use test data when developing.** Development and packaged copies use the same default data directory under the current Windows account. There is no separate development profile. Use a separate Windows account for an isolated test store, or back up existing data before making changes. A portable EXE also uses this storage logic; data is not automatically stored beside the executable.

### Commands

| Command | What it does |
| --- | --- |
| `npm ci` | Installs dependencies from `package-lock.json`. |
| `npm run desktop` | Builds React and launches the desktop app. |
| `npm run build` | Creates the production renderer in `build/`. |
| `npm run electron` | Opens Electron against the existing `build/`; does not rebuild it. |
| `npm test -- --watchAll=false` | Runs the React Scripts test runner once, including catalog import tests. |
| `npm run dist:win` | Builds React and creates an NSIS installer without publishing. |
| `npm run pack:win` | Builds React and creates a portable EXE without publishing. |
| `npm run clean` | Removes `dist/` only, using `rimraf` currently supplied transitively. |

There is no `npm start` script. Opening the renderer in a regular browser does not provide `window.electronAPI`, so the app cannot finish loading its data there.

## Website catalog import

The app includes a snapshot of all **93 products** from the Kutty Couture website catalog (89 accessories and 4 clothing items). On the first launch of this updated version, it adds catalog products to the current inventory automatically. Existing products with matching SKU or barcode are retained without modification; bills are unchanged.

- All imported stock quantities start at **zero**, regardless of website stock counts or availability labels.
- Purchase costs and selling prices start at **zero** because the catalog supplies neither. Enter actual stock, purchase costs, and selling prices before billing.
- Website SKUs are stored as strings in both SKU and the current Barcode field for search compatibility. The website categories, `accessories` and `clothing`, are added to Settings.
- Each website product becomes one inventory record. Sizes/colors remain descriptive metadata; the import does not invent separate variant stock or copy website images.
- The import runs once per store, recorded in `settings.websiteCatalogImport`. Restarting does not reset edited products or bring back deleted ones. Backups include this setting; restoring a backup from before the import will run the additive import again.
- This is a bundled snapshot, not live synchronization. The source website is not modified or required at runtime.

Implementation: `src/data/websiteCatalog.json`, `src/utils/importWebsiteCatalog.js`, and the startup load in `src/App.js`. Run `npm test -- --watchAll=false --runInBand` for import coverage, including duplicate detection, preservation of existing data, zero stock, and restart behavior.

## Main workflows

1. **Configure the shop:** Settings holds business details, logo, categories, export folder, and backup/restore controls. Save configuration with **Save Settings**.
2. **Maintain inventory:** Products supports search, category filtering, add/edit/delete, inline stock and minimum-stock edits, and PDF export of the filtered list. Add Product captures SKU, purchase cost, selling price, quantity, category, and minimum stock.
3. **Make a sale:** Billing searches by name, SKU, or legacy barcode. Add priced, in-stock products, adjust quantities and item discounts, enter bill-level tax/discount percentages, and choose Cash or UPI. Saving validates stock, deducts sold quantities, records a bill, and clears the cart.
4. **Review sales:** Dashboard summarizes today's sales, revenue/profit, payment totals, popular products, and stock health. Reports filters bills by date and invoice number, shows invoice details, allows customer name/phone edits, and exports PDF or Excel reports.
5. **Share an invoice:** Reports provides invoice PDF download and WhatsApp sharing. WhatsApp opens a `wa.me` URL with prepared text; it does not automatically send the message or attach the PDF. Ten-digit phone numbers receive India's `91` prefix.

Amounts are displayed in INR. Payment modes are recorded labels; there is no payment gateway integration.

## Architecture and source map

```text
React renderer: src/index.js -> src/App.js -> pages/components
    |
    | window.electronAPI (Promise-based calls)
    v
preload.js: contextBridge -> ipcRenderer.invoke(...)
    |
    v
electron.js: ipcMain handlers
    |-- electron-store -> config.json
    |-- native folder/save dialogs -> filesystem exports
    `-- desktop window and print handling
```

Electron's main process lives in `electron.js`. The window uses `contextIsolation: true` and `nodeIntegration: false`. Renderer code accesses native features through `preload.js`, rather than importing Node filesystem APIs.

`App.js` owns `products`, `bills`, `settings`, and the product being edited. It loads the store, normalizes settings, then enables persistence effects guarded by `isLoaded`. Pages receive state and setters through props. Billing separately loads and saves its draft `cart`. There is no Redux store or server API layer.

Routing uses `HashRouter` for packaged `file://` URLs. Pages are lazy loaded with a Suspense fallback. `homepage: "./"` in `package.json` keeps built asset paths relative.

| File or directory | Responsibility |
| --- | --- |
| `electron.js` | Window lifecycle, storage initialization, IPC, native dialogs, file writes, migration. |
| `preload.js` | Exposes `getData`, `setData`, `selectExportFolder`, `saveFile`, and generic `invoke`. |
| `src/index.js` | React root, Strict Mode, and global `index.css`. |
| `src/App.js` | Theme, state loading/persistence, first-launch setup, and routes. |
| `src/components/Header.js` | Main navigation, branding, and About dialog. |
| `src/components/SimpleProductForm.js` | Active product form, validation, numeric conversion. |
| `src/pages/AddProduct.js` | Product creation and editing; preserves IDs on edit. |
| `src/pages/Products.js` | Inventory grid, filtering, inline edits, deletion, product PDF export. |
| `src/pages/Billing.js` | Cart persistence, stock checks, discounts, totals, sale creation. |
| `src/pages/Dashboard.js`, `src/pages/Reports.js` | Dashboard aggregation and sales history/reporting. |
| `src/pages/Settings.js` | Shop configuration, categories, logo, backups, storage controls. |
| `src/utils/appSettings.js` | Default settings and shallow normalization of saved settings. |
| `src/utils/exportPDF.js`, `src/utils/exportExcel.js` | jsPDF/AutoTable and SheetJS exports saved through Electron. |
| `src/utils/paymentUtils.js`, `src/utils/whatsappInvoice.js` | Payment display compatibility and WhatsApp messages. |
| `public/` | HTML shell and Windows icon; copied into the renderer build. |
| `.github/workflows/build-release.yml` | Windows build and release workflow. |
| `build/`, `dist/`, `node_modules/` | Generated output/dependencies; ignored by Git. |

The stack uses React 19, React Router 7, Material UI/Data Grid 9, React Scripts 5, Electron 41, electron-store 8, and electron-builder 26. See `package.json` for declared ranges and `package-lock.json` for resolved versions.

### Routes

| Hash route | Screen and entry point |
| --- | --- |
| `#/` | Dashboard; main navigation. |
| `#/products` | Products; main navigation. |
| `#/add-product` | Add/edit form; opened from Products. |
| `#/billing` | Billing; main navigation. |
| `#/reports` | Reports and invoice dialog; main navigation. |
| `#/settings` | Settings; main navigation, also shown during initial setup. |
| `#/pricing` | Older single/pack pricing screen; absent from the header. |
| `#/alerts` | Low-stock list; absent from the header. |
| `#/invoice` | Standalone invoice screen reading `selectedInvoice` from storage; see gaps below. |

`src/components/ProductForm.js` is an older form not imported by the active app. `src/pages/EditProduct.js` is empty. Start product changes in `SimpleProductForm.js` and `AddProduct.js`.

### IPC contract

All exposed bridge methods return promises. Handlers live in `electron.js`.

| Bridge method / channel | Behavior |
| --- | --- |
| `getData(key)` / `get-data` | Reads a stored key; omitting the key returns the whole store. |
| `setData(key, value)` / `set-data` | Replaces the value for that key. |
| `selectExportFolder()` / `select-export-folder` | Returns a directory or an empty string when canceled. |
| `saveFile(payload)` / `save-file` | Takes `directory`, `fileName`, and `base64Data` or `textData`; returns the saved path or `false`. Without a directory, opens a Save dialog. |
| `invoke("get-storage-path-info")` | Returns default/current paths and whether a custom location is active. |
| `invoke("get-current-storage-path")` | Returns the current Electron user-data path. |
| `invoke("select-data-storage-folder")` | Opens the storage folder picker. |
| `invoke("migrate-data-to-location", path)` | Copies business data and writes the storage pointer; returns `{ success, message }`. |
| `invoke("print-invoice")` | Prints the focused window; current UI print buttons instead use `window.print()`. |

For new native behavior, update the main-process handler and preload bridge, and validate renderer inputs in the main process. The existing generic `invoke` method is not a channel allowlist.

## Data model and calculations

There is no formal schema or versioned data migration framework. Records are plain JavaScript objects serialized by electron-store.

| Store key | Main fields / meaning |
| --- | --- |
| `products` | Array of `{ id, name, sku, quantity, price, sellingPrice, category, minStock, pricing }`. `price` means **purchase cost per unit**. Legacy records may use `barcode`. |
| `bills` | Array of `{ id, items, subtotal, taxPercent, taxAmount, discountPercent, discountAmount, total, profit, date, customer, paymentMode }`. New bills are prepended; `date` is an ISO timestamp. `customer` contains name, phone, and email. |
| `cart` | Draft lines with `id`, `productId`, `name`, `qty`, `unitPrice`, `subtotal`, `discountPercent`, `discountAmount`, `total`, `cost`, `profit`, and `breakdown`. Customer/payment/tax inputs are not saved with the draft. |
| `settings` | `shopName`, `shopAddress`, `shopEmail`, `shopPhone`, `billLogo` (data URL), `exportPath`, `dataStoragePath`, `categories`, and `hasCompletedSetup`. |

Product, cart-line, and bill IDs use `Date.now()`. Bill items retain saved names and amounts rather than looking them up again from the current catalog. New payment values are `cash` and `upi`; the display helper maps legacy `card` values to UPI.

Billing reads `sellingPrice ?? pricing.single ?? 0`. The active product form writes both `sellingPrice` and `pricing.single` for compatibility. Older `pricing.packs` objects map pack sizes to total pack prices. Preserve compatibility when changing fields or importing older data.

Current checkout calculations:

```text
line subtotal = unit selling price * quantity
line discount = line subtotal * item discount percent / 100
line total    = line subtotal - line discount
line cost     = purchase cost * quantity
line profit   = line total - line cost

bill subtotal = sum of discounted line totals
bill tax      = bill subtotal * tax percent / 100
bill discount = bill subtotal * bill discount percent / 100
bill total    = bill subtotal + bill tax - bill discount
bill profit   = sum of line profits - bill discount
```

Tax is excluded from reported profit. Calculations use JavaScript numbers; display formatting is not a fixed-precision accounting model. Stock validation aggregates all cart lines for the same product before saving.

## Storage, backups, and migration

The default Windows store is:

```text
%APPDATA%\Kutty Couture Inventory\config.json
```

Electron also uses the active directory as `userData`. This location is independent of the checkout, `build/`, and `dist/`. The app configures no encryption key for the JSON data.

- **Export folder:** `settings.exportPath` controls PDF, Excel, and backup destinations. Without it, each export opens a Save dialog. With it, generated filenames are written directly, so repeated same-day report exports can overwrite previous files.
- **Backup export:** Settings exports `{ products, bills, settings, date }`, excluding the draft cart and other store keys.
- **Backup import:** Replaces products, bills, and settings, then reloads the renderer. It is not a merge and does not clear the existing cart. Importing `settings.dataStoragePath` does not relocate storage.
- **Storage migration:** Copies products, bills, and settings into the chosen directory and writes `%APPDATA%\Kutty Couture Inventory\.storage-config` with that path. It does not copy the cart or delete the old store.
- **Restart after migration:** The running process continues using the old store until restarted. Restart immediately before making more business-data changes.
- **Missing custom directory:** An invalid/missing custom path causes startup to fall back to the default location and remove the pointer. A disconnected drive can make the app appear to have different or missing data.

Back up before testing imports or migration. Use an empty test destination for migration because it replaces the destination's business-data keys. Multiple app instances or machines sharing a folder have no application-level transaction or conflict-resolution support.

## Development and verification

### Normal edit cycle

1. Create a focused branch, for example `git switch -c codex/improve-product-search`.
2. Change the responsible page, component, or utility from the source map.
3. Run `npm run build` and inspect errors or warnings.
4. Close the running app and run `npm run electron` to load the new build, or use `npm run desktop` to build and launch together.
5. Exercise the affected workflow with test data, including persistence after restart.

For an optional live renderer development loop, the existing Electron `--dev` branch loads `http://localhost:3000` and opens DevTools. Start the renderer in one PowerShell terminal:

```powershell
$env:BROWSER = "none"
npx react-scripts start
```

Once port 3000 is ready, start Electron in a second terminal:

```powershell
npm run electron -- --dev
```

This is a manual two-process workflow. Changes to `electron.js` or `preload.js` require restarting Electron. The optional `electron-reloader` package is not installed, so its development-mode warning is expected. If the renderer chooses another port, Electron still targets port 3000.

### Verification checklist

Catalog import tests are checked in; there is no dedicated lint script or CI test step. Run `npm test -- --watchAll=false --runInBand` before submitting import changes. The production build checks compilation and configured React Scripts lint rules. Other workflows still need manual verification.

For a manual smoke check on an isolated test store:

- Complete first-launch setup, save shop details/categories, and confirm they survive restart.
- Add a product with stock `10`, purchase cost `100`, selling price `150`, and minimum stock `3`; edit it and test search/category filters.
- Bill two units with a `10%` item discount, `5%` tax, and `10%` bill discount. Expect subtotal `270`, tax `13.50`, bill discount `27`, total `256.50`, profit `43`, and remaining stock `8`.
- Try exceeding stock, including on multiple cart lines for the same product. Confirm the saved bill appears once and the cart clears.
- Restart with an unsaved cart and check restoration; restart after a sale and check the bill and stock.
- In Reports, apply date/invoice filters, edit customer details, and inspect exported invoice PDF, report PDF, and Excel files. Check product PDF export too.
- Export a backup and restore it only in the test store. For migration changes, verify the new path after a full restart and the documented cart exclusion.
- For printing/sharing changes, inspect print preview and the prepared WhatsApp message with test customer details.

In pull requests, describe the problem, changed behavior, and checks performed. Add targeted tests for calculation or persistence changes. Keep `package.json` and `package-lock.json` in sync when changing dependencies. Do not commit generated builds or customer backups.

## Windows packaging and CI

Close running copies from `dist/win-unpacked` before packaging to avoid locked files. Build the renderer before invoking electron-builder directly:

```powershell
npm run build
npx electron-builder --dir
```

The unpacked app is `dist/win-unpacked/Kutty Couture.exe`. Use `npm run dist:win` for the NSIS installer or `npm run pack:win` for the portable executable. Expected outputs:

```text
dist/Kutty Couture Setup <version>.exe
dist/Kutty Couture-<version>.exe
```

Packaging lives in `package.json`: `main` and `build.extraMetadata.main` point to `electron.js`; included files cover `build/`, Electron entry files, and dependencies. `asar` is disabled. `signAndEditExecutable: false` disables signing/editing of the Windows executable. Local packaging scripts use `--publish never`.

The workflow in `.github/workflows/build-release.yml` runs on pushes to `main`/`master`, release creation, and manual dispatch. It uses `windows-latest`, Node 20, and `npm ci`. Installer EXEs are uploaded as a `windows-exe` workflow artifact before the portable build; release upload steps run only for tag refs. Release asset uploads require suitable repository permissions for `GITHUB_TOKEN`.

**Before release work:** verify the publishing destination. `build.publish` currently names `immohanrajmuthu1502/inventory-win-app`, which differs from this checkout's `Immohanrajmuthu/kuttycouture-inventory-app` remote. `electron-updater` is installed but never called by the app; automatic updates are not implemented. Keep package/lockfile versions and hard-coded About text in Header and Settings consistent when preparing releases.

## Known implementation gaps

These are current behaviors to account for when contributing, not completed features:

- **Pricing screen differs from checkout:** `/pricing` writes `pricing.single` and pack prices but does not update `sellingPrice`. Billing prefers `sellingPrice` and does not apply pack pricing. The older utility uses largest packs first, which does not guarantee the cheapest combination.
- **Stock thresholds differ:** Dashboard uses `quantity <= Number(minStock || 10)` (zero becomes 10); StockAlert uses `quantity < 10`; Products has separate minimum-stock/color comparisons.
- **Standalone invoice is not wired into checkout:** `/invoice` reads a `selectedInvoice` store key that no current flow writes. Reports uses an in-memory invoice dialog. Billing's Save & Print saves/clears the cart, then prints the current page without navigating to an invoice.
- **Persistence is not a sale transaction:** Products, bills, and cart are written independently. Renderer persistence effects do not await or surface write failures. Backup import lacks structural schema validation.
- **Validation varies:** The active product form checks negative values, but inline grid edits and bill-level percentage inputs do not provide equivalent validation. Review every write path when tightening rules.
- **Fallback logo is missing:** Header references `public/appLogo.png`, which is not checked in. Uploading a shop logo in Settings supplies the displayed image.
- **No authentication, roles, audit trail, or automated updater:** Older documents may describe business roles or planned capabilities; these are not enforced by the code.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `npm ci` reports `EPERM` unlinking Electron DLLs | Close development and packaged app windows, especially copies under `dist/win-unpacked`, then retry. |
| App remains on "Loading..." | Use Electron; inspect the renderer console and main-process logs for bridge/storage errors. A regular browser lacks the preload bridge. |
| Electron cannot load `localhost:3000` | In `--dev` mode, start the React server first on port 3000. Clear unintended `NODE_ENV=development` when running a production build. |
| Changes do not appear | `npm run electron` reuses `build/`; run `npm run build` first or use `npm run desktop`. |
| Packaged app cannot find `electron.js` or assets | Preserve entry points, included files, `homepage: "./"`, and HashRouter; rebuild before packaging. |
| Packaging fails on locked files | Close the packaged EXE before `npm run clean` and rebuilding. `clean` removes `dist/`, not `build/` or business data. |
| `winCodeSign` extraction reports symbolic-link permission errors | Check Windows Developer Mode or use an appropriately privileged packaging terminal; signing/editing is already disabled in this config. |
| Data seems missing after migration or disconnecting a drive | Check Settings and startup storage-path logs; reconnect the custom location and inspect pointer behavior before importing backups. |

## Other documentation

- [Functional specification](docs/FUNCTIONAL_SPEC.md): earlier description; some dashboard, pricing, backup, and data-model details predate the code.
- [Release guide](RELEASE.md): release process background.
- [GitHub Actions setup](GITHUB_ACTIONS_SETUP.md) and [release checklist](RELEASE_READY.md): historical notes with older paths, filenames, and placeholders.

Use current source, `package.json`, and the workflow as the source of truth when older documents differ.
