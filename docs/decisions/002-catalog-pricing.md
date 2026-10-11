# 002 — Catalog identity, pricing, and backup schema 2

Date: 6 October 2026. Status: implemented in the isolated redesign workspace.

## Import and identity

Import the bundled website snapshot once into an empty redesign catalog, inside one transaction. The live legacy store and website are never read or modified by this entry point. The import report contains the source counts and clothing mapping. A persisted import marker makes restart/replay safe without resetting edits or archives.

The source has 93 products (89 accessories, four clothing), represented by 101 inventory entries. Four clothing SKUs change from 200000–200003 to 100089–100092. Existing accessory SKUs remain unchanged. Preserve the original website IDs and old SKU mapping; no photos are imported. All quantities, costs, and prices start at zero.

Ten accessories have `Available on enquiry` as their source size. Preserve those labels as inactive entries and flag size review. The editor allows renaming an entry to an actual size and adding other sizes; enquiry labels cannot be activated. Fifty-three products have no color data and are flagged for review. Combined source labels such as `Black and Rose Gold` remain one choice. The owner can add actual choices or confirm that none are needed.

Products and variants use stable internal IDs. Existing variants/colors cannot be removed through saves; deactivate them instead. Existing product structure (sized or unsized) stays fixed; new products can choose it. New clothing products default to S/M/L. The UI supports adding, reordering, and deactivating sizes and archiving/restoring products. Stock is read-only until the inventory phase.

New SKUs are allocated transactionally from 100093, independent of category, and not reused after archive. Saved operation IDs make retrying the same save idempotent; revision checks reject stale edits. Restore keeps the larger of the current and backed-up next-SKU values, preventing reuse of numbers allocated since the backup.

## Private pricing

Manual purchase cost and selling price use integer paise. The editor accepts non-negative amounts with up to two decimal places; invalid, non-finite, negative, and excessive values are rejected again in the main process. Zero prices are allowed while setting up the catalog; billing will enforce the zero-price block when implemented.

The optional per-size calculator supports markup (default) and margin, including shipping, packaging, and other expenses. Expenses can be per item or shared over whole purchase units. Applying changes the draft selling price and retains calculator inputs and allocated expense components; it does not overwrite purchase cost. Saving the product persists the draft. A manual price can override the suggested value.

Money calculations use integer arithmetic, with BigInt intermediates for ratio multiplication and round-half-up to paise. For a whole purchase, round the combined average expense per unit once, then assign remaining paise to components by descending fractional remainder (shipping, packaging, other breaks ties). The component total therefore equals the displayed unit expense. This is an averaged pricing estimate, not a FIFO/lot ledger or an exact allocation to individual purchased units. The original purchase expense totals and divisor remain available in calculator settings.

Low stock means active size quantity is at or below its editable minimum threshold; zero is the default. Colors never split quantity or price.

## Persistence and recovery

Schema 2 adds `products` (unique SKU and JSON record), `catalog_state` (next SKU and import report), and `catalog_operations` (idempotency journal) to the preferences table. This keeps the current product contract readable while retaining transactional updates, SQL identity constraints, and room for later inventory/billing tables.

Upgrading a schema-one store creates a settings safety backup first. Schema-two backups contain the entire current catalog, calculator inputs, prices, metadata, operation journal, counters, and settings. Validation checks money, variants, identity uniqueness, sequence bounds, and report shape before restore. Restore creates a complete safety backup, then replaces records atomically. Schema-one backups restore preferences only and preserve the catalog; the review screen identifies that scope.

The current backup limit is 10 MiB. Export fails explicitly if it cannot produce a supported backup. Daily scheduling, operational history, and production migration remain later work.

## Source map and verification

- `desktop/catalog.cjs`: import mapping, product contract validation, immutable identity/stock rules.
- `desktop/foundation-store.cjs`: migrations, transaction boundaries, catalog save/retry, backup/restore.
- `src/redesign/domain/pricing.js`: shared money parsing and calculator arithmetic.
- `src/redesign/CatalogPage.js`: product list, editor, and calculator.
- `desktop/tests/catalog.test.cjs`: import, preservation/retry, validation, pricing, backups, and schema upgrade.
- `src/redesign/CatalogPage.test.js`: calculator application/save, clothing defaults/add size, failed save and unsaved-edit protection.

Verification: 13 Node tests and 12 Jest tests passed; strict React build passed. Electron smoke checks verified all 93 imported products, expanded clothing sizes, calculator application and persistence after reload, and compact-width layout. Light catalog and calculator screenshots were inspected. Live-store cutover and website publication have not occurred.
