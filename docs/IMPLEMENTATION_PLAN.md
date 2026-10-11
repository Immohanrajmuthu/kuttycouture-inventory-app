# Redesign implementation plan

Updated: 6 October 2026. Status: foundation, phase 2 catalog/pricing, and phase 3 stock operations implemented in the isolated development entry point. Billing, publishing, and production cutover remain pending.

Phase 1 provides the two-section shell, saved theme/navigation/business details, narrow validated IPC, SQLite transactions, and backup/restore. See [storage decision 001](decisions/001-foundation-storage.md). Phase 2 upgrades to schema 2 with restart-safe catalog import, stable product/variant IDs, non-reused SKUs, revision checks, manual prices, and an optional calculator. See [catalog decision 002](decisions/002-catalog-pricing.md). Daily backup scheduling and live migration remain future work. Transaction tests validate persistence behavior, not completed billing behavior.

Phase 3 upgrades to schema 3: reviewed stock receipts and corrections, immutable movements ordered newest-save first, retry-safe commands, availability-change tracking, and stock-aware backup validation. See [stock decision 003](decisions/003-stock-history.md). Sold/cancelled-bill movements will be added in the billing phase; their history filters currently have no generated entries.

The [redesign specification](REDESIGN_SPEC.md) contains the agreed product behavior. This plan proposes the technical structure and delivery checks. Recommendations below are not presented as already approved technology choices.

## Current foundation and gaps

The repository currently uses React, Material UI, Electron, and `electron-store`. `src/App.js` owns shared renderer state; `preload.js` exposes read/write IPC; `electron.js` persists local JSON. The current bundled catalog importer adds products to an existing store, which is different from the agreed fresh catalog-only migration.

The most consequential gap is independent persistence of products, bills, and drafts. A saved bill, its invoice number, and its inventory changes must become one durable operation. Existing generic IPC and renderer persistence should not remain the authority for financial/stock changes.

Retain the desktop platform and useful UI infrastructure where they fit. Do not combine the redesign with an unnecessary framework migration. Review dependency health and packaging compatibility during foundation work; this plan is not a dependency/security audit.

## Recommended responsibilities

| Module | Owns |
| --- | --- |
| Catalog | Product/size identity, metadata, archiving, SKU allocation |
| Pricing | Manual prices, calculator, expense allocation, rounding rules |
| Inventory | Stock receipts, adjustments, balances, immutable movements |
| Billing | Draft, validation, invoice snapshots, payment/cancellation transitions |
| Publishing | Public allowlisted projection, change preview, publication versions/retry |
| Documents | Shared invoice view model, A4 print and PDF; later thermal adapter |
| Backup | Consistent snapshots, validation, retention, restore |
| Settings | Business profile, theme, preferences |
| Desktop persistence | Validated IPC commands, transactions, migrations, filesystem access |

Keep pure calculations separate from components. The renderer requests operations such as `saveBill`, `receiveStock`, `adjustStock`, and `cancelUnpaidBill`; the main process validates and commits them. Replace arbitrary mutation channels with narrow allowlisted commands. Keep context isolation and no renderer Node integration.

### Storage decision to resolve in phase 1

Recommend evaluating SQLite for atomic operations and migrations, with JSON used for validated interchange/backup and website publication. This is a recommendation, not a selected dependency. If local JSON remains the store, demonstrate equivalent serialized writes, atomic replacement, crash recovery, and transaction behavior before proceeding. The user's requested JSON product shape can be supported regardless of the internal persistence engine.

Do not share a writable local store through a synced folder as a substitute for future multi-computer synchronization.

## Proposed logical data contract

Use explicit `schemaVersion`, stable IDs, integer minor-unit money (paise), non-negative integer stock, ISO timestamps, and local calendar bill dates. Numeric identifiers are strings. Generated IDs in the example are illustrative.

```json
{
  "schemaVersion": 1,
  "product": {
    "id": "product-frock",
    "sku": "100089",
    "legacySkus": ["200000"],
    "websiteId": "existing-website-identity",
    "name": "Lollipop & Ice-cream Printed Frock",
    "category": "clothing",
    "description": "",
    "archived": false,
    "hasSizes": true,
    "colors": [{ "id": "color-pink", "label": "Pink", "active": true }],
    "variants": [
      {
        "id": "size-s",
        "label": "S",
        "sortOrder": 0,
        "active": true,
        "stock": 0,
        "minStock": 0,
        "purchaseCostPaise": 0,
        "sellingPricePaise": 0,
        "unitExpensesPaise": { "shipping": 0, "packaging": 0, "other": 0 }
      }
    ]
  }
}
```

The example is a contract illustration, not an instruction to import Pink or S for every catalog item. A no-size product still has one stable inventory variant with `hasSizes: false`. Threshold defaults need a defined rule; zero above is illustrative, not a confirmed low-stock preference.

Other records:

| Record | Required information |
| --- | --- |
| Stock movement | ID, operation ID, product/variant IDs, type, signed delta, balance after, reason/source ID, saved timestamp, ordering sequence; received cost where relevant |
| Invoice | ID/number, bill date, saved timestamp, status, channel, handover, customer snapshot, invoice lines, discount, totals, delivery charge/expense, payment/cancellation details |
| Invoice line | Product/variant/color IDs and label snapshots, SKU/name, quantity, selling price, purchase cost and expense snapshot, allocated discount |
| Stock entry | Operation ID, timestamp, affected sizes/quantities/costs; no receipt attachment or editable received date |
| Draft | One recoverable draft; references and entered details, no committed stock effect |
| Publication | Public payload version/hash, pending changes, last successful version, last result/error |
| Backup manifest | Schema/app version, creation timestamp, counts, integrity metadata |
| Counters/migration | Next SKU, next invoice number, completed migration ID, old/new identity map |

Public payloads must be built from an explicit allowlist: website identity/SKU, catalog text, active size labels and boolean availability, shared color choices, and overall availability. Never serialize private product objects and remove a few sensitive fields afterward. Do not send photos or overwrite website-owned media.

### Invariants to enforce

- One bill-save transaction validates combined quantities per size, allocates one invoice number, saves snapshots, deducts stock, appends movements, clears the committed draft, and marks changed public availability pending.
- Idempotent operation IDs prevent duplicate bills, receipts, cancellations, or adjustments after double-clicks/retries.
- Marking unpaid as paid changes payment state only. Cancelling unpaid restores each size once; paid/cancelled bills reject that transition.
- Reject non-finite/negative money, fractional/negative quantities, zero-priced bill lines, over-discounting, and margin percentages at or above 100.
- Define one money-rounding policy, including purchase expense division and discount allocation, so line totals, bill totals, PDFs, and profit reconcile.
- Immutable invoice snapshots survive catalog renames, price changes, archiving, and business-setting changes.
- Timestamp/order sorting puts the newest saved stock changes first, even if several sizes share a timestamp.
- If catalog changes while a publication is in flight, acknowledge only the sent version and leave later changes pending.
- A failed write or restore cannot leave half an operation applied or falsely report success.

## Delivery phases

### Phase 1 — Safe foundation and shared shell

Create an isolated development/test store and migration fixtures; never run development initialization against the live store. Establish the two-section navigation, theme tokens, accessible shared controls, and remembered screen.

Choose persistence after a small transaction/crash-recovery spike. Document the decision and define versioned schemas, IPC commands, money rules, IDs, counters, and timestamps. Build backup/restore primitives before migration.

**Exit evidence:** development store isolation; invalid IPC rejected; interrupted-write recovery; a transaction either fully commits or has no effect; keyboard and light/dark shell review. No live migration yet.

### Phase 2 — Catalog, migration preparation, and pricing

Implement grouped products, size rows, shared colors, archive/deactivate, auto SKUs, and the optional calculator. Build the catalog-only migration into a temporary store with a preview/report. Preserve descriptions and website mappings; flag missing variants. Link the zero-price billing rule to product editing.

**Exit evidence:** source/migrated counts and unique identities match; four clothing mappings verified; repeat migration makes no duplicates/resets; all opening quantities/costs/prices are zero; no legacy bills/history; manual prices and markup/margin/expense allocation reconcile. Review the product editor with the owner.

### Phase 3 — Stock operations and history

Implement one-product receiving, adjustments, low-stock filtering, latest-first history, and public-availability change detection. Save each operation with one automatic timestamp and stable ID.

**Exit evidence:** zero receive rows keep costs; positive rows add rather than replace; corrections preserve prices/costs; invalid/no-change corrections are rejected; duplicate submission has one effect; size balances reconcile with movements; equal-time entries sort deterministically.

### Phase 4 — Billing and invoice lifecycle

Implement SKU/name search and keyboard selection, size/color choice, draft recovery, stock/price validation, customer/handover fields, discount/delivery totals, review/save, bills list, pay unpaid, and cancel unpaid.

**Exit evidence:** stock across colors cannot be oversold; zero-price items are blocked; paid/unpaid save deducts once; repeated save/retry cannot create another invoice; paid transition does not deduct; cancellation restores once; draft/restart works; historical costs/prices remain unchanged after product edits. Simulate disk/write failures at commit boundaries.

### Phase 5 — A4 invoice, PDF, and sharing

Create a format-independent invoice view model and an A4 template with the confirmed business details and footer. Support print/PDF and prepared WhatsApp text with manual sending/attachment.

**Exit evidence:** visually inspect one-page and multi-page PDFs, long names, size/color lines, paid/unpaid/cancelled states, and totals. Verify a Windows print preview. No clipped totals or private costs/profit in output. Owner reviews the layout. Thermal output remains deferred.

### Phase 6 — Website publication

Inspect the website's actual catalog loading and deployment/storage mechanism. Choose the smallest authenticated publication method that preserves image ownership and supports retry. Build public-only preview and last-success state; implement identity reconciliation for the clothing SKU transition.

**Exit evidence:** stage an actual update with one listing per SKU; existing images survive; only Available/Unavailable is exposed; private fields are absent from payloads and logs; offline/failure retains pending work; retry is idempotent; a sale during publication remains pending if not in the sent version. Do not equate a local JSON export with completed website synchronization.

### Phase 7 — Settings, backup experience, and live cutover

Complete business preferences, daily scheduling/30-backup retention, manual export, restore review and safety snapshot. Test sustained use across a date change. Finish a contributor guide for the new implementation and remove or label outdated legacy documentation/routes.

Run the catalog-only migration with a verified backup of the actual active store, validate the resulting store before activation, and retain rollback instructions. Test the packaged Windows app before using it for real sales.

**Exit evidence:** successful restore into a clean isolated profile; corrupt/incompatible backup rejection; cancelled restore leaves data intact; failed safety backup aborts restore; restart after migration retains data; packaged offline billing and PDF output work. Owner completes receive stock → set price → unpaid sale → pay → print and unpaid sale → cancel journeys.

## Production-readiness gate

- [ ] All version-one acceptance checks above pass against an isolated store and packaged Windows build.
- [ ] Main-process validation, narrow IPC, safe external-link handling, and dependency review completed.
- [ ] Failures are visible and recoverable; sensitive customer/financial values are excluded from routine logs.
- [ ] Crash/restart and duplicate-command tests demonstrate consistent invoice/stock state.
- [ ] Backup creation and a full restore are demonstrated, not just file export.
- [ ] A4/PDF is visually checked; keyboard focus, labels, contrast, and laptop layouts are reviewed.
- [ ] Migration report reconciles catalog count, SKU mapping, zero balances, and empty operational history.
- [ ] Website publication is verified end to end without prices, exact stock, or lost photos.
- [ ] Windows installer/upgrade behavior and the release/signing approach are reviewed; build/install smoke checks pass.
- [ ] New contributor instructions and operator recovery instructions match the shipped implementation.

These are future release checks, not claims that the existing app is production ready.

## Decisions to resolve at the relevant phase

| Decision | When | Proposed direction |
| --- | --- | --- |
| Storage engine and schema validator | Phase 1 | Evaluate SQLite transactions; preserve JSON interchange. |
| Rounding/expense allocation | Phase 1 | Integer paise with deterministic remainder allocation. |
| Low-stock default and equality rule | Resolved in phase 2 | Editable zero default; low when quantity is at or below threshold. |
| Missing catalog sizes/colors | Implemented for review in phase 2 | Enquiry-only size entries inactive; 53 missing-color and 10 ambiguous-size source records flagged. Owner supplies actual choices. |
| Bill-date bounds and invoice sequence at cutover | Phase 4/7 | Separate bill date from recorded time; verify any external numbering continuity. |
| Website connection, credentials, archived-listing behavior | Phase 6 | Inspect actual website first; protect media and private data. |
| Automatic backup folder | Phase 7 | Explain location; allow manual external copies. |
| Logo asset and final A4 composition | Phase 5 | Use supplied business details; review output with owner. |

No unresolved item above requires delaying independent work in earlier phases. Multi-computer sync, thermal printing, and offers remain separate later projects rather than hidden dependencies for version one.
