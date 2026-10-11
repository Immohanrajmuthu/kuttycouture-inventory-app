# 003 — Stock operations, history, and backup schema 3

Date: 6 October 2026. Status: implemented in the isolated redesign workspace.

## Operator workflows

Receive stock searches by product name/SKU, with keyboard result selection. One product's active sizes appear together. Enter received quantities and purchase costs, review the positive rows and purchase total, then confirm. Quantities are added to current balances; zero rows retain all their data, including costs. Selling prices and allocated pricing expenses are untouched. Archived products and inactive sizes cannot receive stock.

Adjust stock selects one product/size, displays the current balance, and accepts actual quantity, one of Count correction/Damaged/Missing/Other, and an optional note. Review the before/change/after values before saving. Unchanged quantities are rejected. Financial fields remain unchanged. Corrections may address an inactive size or archived product, since an old balance may still need correction.

The application records one automatic saved timestamp for the entire operation. There is no separately entered received date and no uploaded receipt. Each movement retains the SKU, product name, size label, source/reason, quantity change, balance before/after, timestamp, and (for received stock) purchase cost at that time.

History sorts by the database's increasing save sequence in descending order. It therefore puts the latest saved entry first even when timestamps tie or the system clock changes. Search supports SKU and historical/current product names. Filters include Received, Adjustment, Sold, and Cancelled bill; the last two acquire entries in the billing phase. History has no edit/delete command.

## Persistence and validation

Schema 3 adds:

| Table | Responsibility |
| --- | --- |
| `stock_operations` | Operation ID, request hash, product, type, and shared timestamp |
| `stock_movements` | Immutable movement snapshots and increasing save sequence |
| `pending_availability` | Products whose stock change crossed a public availability boundary |

The main process owns stock mutations through `stock:receive` and `stock:adjust`. One SQLite transaction validates the current product revision, writes the operation and movements, updates balances/costs and product revision, and records pending availability. It commits everything or nothing. The product editor still cannot change stock directly.

Operation IDs make identical retries harmless and reject reuse for a different payload. A stale review cannot overwrite newer product/stock data. The review remains available after a failed save for retry; Reload stock lets the operator discard it and start again with current values. Unsaved changes are guarded during navigation/window closure.

Quantities must be non-negative integers at most 1,000,000 per size; received quantities must include at least one positive row. Costs are validated integer paise. Adjustments require a listed reason and a note of at most 500 characters. Duplicate/unknown size IDs and unsafe totals are rejected. The stock timestamp comes from the main process, never a renderer-supplied date.

Availability tracking records only changes in active-size `stock > 0` state. It does not contact the website or expose quantities/prices. The later publishing phase will integrate these flags with catalog text edits and the actual public publication baseline.

## Recovery and compatibility

An existing schema-two workspace gets a catalog safety backup before migration. Schema-three backups include movements, operation IDs, and pending availability together with the catalog/settings. Validation checks identity references, movement arithmetic, operation timestamps, uninterrupted per-size balance chains from zero, and equality between final history balances and stored stock.

Restore validates first and creates a current safety backup before replacing data atomically. Schema-one settings-only backups preserve catalog and stock. Schema-two backups represent the earlier zero-stock catalog: restoring one clears later stock history and restores that catalog state. The review screen shows product/history counts and replacement scope. A schema-two payload containing unexplained nonzero stock is rejected instead of inventing history.

This is still development storage; no live migration or actual website update is performed. Daily scheduling/retention and invoice-related stock changes remain later work.

## Source map and verification

- `desktop/inventory.cjs`: command validation, pure stock transformation, backup balance-chain validation.
- `desktop/foundation-store.cjs`: schema migration, atomic persistence, reverse-sequence reads, complete backup/restore.
- `src/redesign/StockPage.js`: receiving, corrections, reviews, and history.
- `desktop/tests/inventory.test.cjs`: zero rows, cost preservation, retry/stale rules, failure rollback, ordering, backups, and schema upgrade.
- `src/redesign/StockPage.test.js`: review-before-write, failed-save retry, unchanged correction, history filtering.

Verification on 6 October 2026: 21 Node tests and 15 Jest tests passed; the strict React production build passed. The hidden Electron check received two sizes, corrected one quantity, verified the correction appears first, and confirmed persistence after reload. Receipt/correction reviews in light mode and stock history in dark mode were captured and visually inspected. Compact-width overflow checks passed. The desktop smoke test uses a fresh test directory, never the normal redesign or legacy store.
