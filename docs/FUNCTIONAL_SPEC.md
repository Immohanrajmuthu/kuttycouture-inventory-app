# Kutty Couture Inventory – Functional Specification

## 1) Application Purpose
Kutty Couture Inventory is a desktop-first inventory and billing application for small retail operations. It helps users:
- Maintain product master data (name, barcode, category, stock, purchase cost, minimum stock).
- Define selling prices (single and pack pricing).
- Create bills/invoices with customer and payment details.
- Track sales summaries and export reports.
- Backup and restore operational data.

The UI is built with React + Material UI, wrapped in Electron for desktop usage with local persistence via `electron-store`.

---

## 2) Actors
- **Store Owner / Admin**: full access to products, pricing, billing, reports, settings.
- **Billing Staff**: day-to-day billing, customer capture, printing invoices.

---

## 3) Functional Modules

### 3.1 Navigation & Shell
**Feature:** Top menu navigation and branding.
- Displays logo and menu: Dashboard, Products, Billing, Reports, Settings.
- Highlights active page.
- Clicking logo returns to Dashboard.

**Business Value:** Fast access to core workflows.

---

### 3.2 Data Persistence
**Feature:** Save and load products/bills locally.
- On app startup, loads `products` and `bills`.
- In Electron mode: uses IPC (`get-data`, `set-data`) with `electron-store`.
- Data auto-saves whenever products or bills change.

**Business Value:** Offline-capable usage and retained data between sessions.

---

### 3.3 Dashboard
**Feature:** Basic inventory overview.
- Displays total product count.

**Business Value:** Quick health snapshot.

---

### 3.4 Product Management
**Feature:** Add, edit, delete, search, and filter products.

#### Add/Edit Product
- Input fields: product name, barcode, quantity, purchase price, category, minimum stock.
- Validation:
  - Product name required.
  - Quantity, price, minStock cannot be negative.
- Edit mode pre-fills existing values.
- Save shows success message and redirects to product list.

#### Product List
- Grid view with columns: product, barcode, category, stock, purchase cost, minimum stock, pricing status, actions.
- Search by product name, barcode, category.
- Filter by category.
- Inline warning style for minimum stock threshold breach.
- Delete action with confirmation prompt.

**Business Value:** Centralized stock master with quality checks.

---

### 3.5 Pricing Engine
**Feature:** Configure selling price and pack prices; preview profitability.
- Select product to set:
  - Single price.
  - Pack prices for quantities 2, 3, 5, 10.
- Preview by quantity using best-pack breakdown logic.
- Shows selling price, composition breakdown, purchase cost, profit, and profit percentage.
- Saves pricing into product record.

**Best-price calculation behavior:**
- Uses largest pack sizes first (descending order) where pack price exists.
- Remaining quantity priced at single rate.
- If no packs configured, total = qty × single.

**Business Value:** Improves margin control and consistent price application.

---

### 3.6 Billing / Point of Sale
**Feature:** Build cart, compute totals, and save bills.

#### Product Search & Selection
- Debounced search by name or barcode.
- Prevents unpriced products from being billed (warning shown).

#### Cart Management
- Add selected product with quantity.
- Auto-calculates:
  - line total using pricing utility,
  - line cost from purchase price,
  - line profit.
- Supports quantity updates and item removal.
- Clear-cart confirmation.

#### Bill Totals
- Computes grand total of cart.
- Supports tax % and discount % adjustments.
- Final total = grandTotal + taxAmount - discountAmount.

#### Customer & Payment Data
- Captures customer name, phone, email.
- Captures payment mode.

#### Bill Save/Print
- Saves bill with timestamp and all details into bill history.
- Optional print flow via `window.print()`.

**Business Value:** End-to-end checkout workflow with profitability insight.

---

### 3.7 Reports & Analytics
**Feature:** Filter and review bills; export data.
- Filters: today, this week, this month, all.
- KPI cards:
  - total sales count,
  - items sold,
  - revenue.
- Bill table includes date, customer, phone, payment, item count, total.
- Click row to view invoice details in dialog.
- Export filtered result to:
  - Excel (`.xlsx`),
  - PDF (`.pdf`).

**Business Value:** Operational monitoring and external sharing of sales data.

---

### 3.8 Invoice View
**Feature:** Render single invoice with print/export.
- Displays business header, invoice info, customer info, itemized rows, total.
- Actions:
  - Print invoice.
  - Download invoice PDF.

**Business Value:** Customer-facing documentation and records.

---

### 3.9 Stock Alerts
**Feature:** Low-stock list.
- Shows products where quantity < 10.

**Business Value:** Prevents stockouts through simple threshold visibility.

---

### 3.10 Settings (Backup & Restore)
**Feature:** Data portability and disaster recovery.
- Export backup JSON containing products, bills, and export date.
- Import backup JSON to overwrite current data.
- On successful restore, app reloads.

**Business Value:** Reduces risk of data loss and enables migration.

---

## 4) Data Model (Logical)

### Product
- `id`: number (timestamp-based)
- `name`: string
- `barcode`: string
- `quantity`: number
- `price`: number (purchase cost)
- `category`: string
- `minStock`: number
- `pricing`:
  - `single`: number
  - `packs`: object keyed by pack size (`2`, `3`, `5`, `10`) => number

### Bill
- `id`: number (timestamp-based)
- `items`: array of cart lines
- `total`: number
- `profit`: number
- `date`: locale string
- `customer`:
  - `name`: string
  - `phone`: string
  - `email`: string
- `paymentMode`: string

### Bill Item
- `id`: number
- `productId`: number
- `name`: string
- `qty`: number
- `total`: number
- `cost`: number
- `profit`: number
- `breakdown`: string

---

## 5) Non-Functional Characteristics (Observed)
- **Offline-first:** no backend dependency.
- **Desktop packaging:** Electron wrapper.
- **Performance:** debounced search in billing.
- **Usability:** snackbars, prompts, simple form validations.

---

## 6) Known Gaps / Improvement Opportunities
- Dashboard metrics are minimal (currently only total products).
- Stock alert threshold is fixed at 10 instead of per-product `minStock`.
- No role-based access control or authentication.
- No audit log for edits/deletions.

---

## 7) Recommended Additional Documents (Need Your Approval)
If you approve, I can create these next:
1. **Software Requirements Specification (SRS)** – detailed functional + non-functional requirements, constraints, acceptance criteria.
2. **User Manual (Operations Guide)** – step-by-step task flows for staff.
3. **Technical Architecture Document** – component map, data flow, Electron/React boundaries, persistence strategy.
4. **Test Plan & UAT Checklist** – module-wise test cases and acceptance scenarios.
5. **Data Backup/Recovery SOP** – operational safety procedure for backup import/export.

