# Kutty Couture desktop redesign: version one

Updated: 6 October 2026.

This is the consolidated target design agreed during the requirements conversation. It describes the rebuild, not features already delivered. The existing application is documented in [README](../README.md). See the [implementation plan](IMPLEMENTATION_PLAN.md) for sequencing, technical recommendations, and remaining decisions.

## 1. Purpose and boundaries

Help the owner maintain a reliable product catalog, set prices, record stock, and create bills with minimal effort. Version one runs on one Windows laptop, with local storage and offline inventory and billing. Internet is required for website publishing and WhatsApp sharing.

There are two primary sections inside one application:

| Section | Screens and actions |
| --- | --- |
| Products & Pricing | Product list, product editor and calculator, receive stock, adjust stock, stock history, publish website changes |
| Billing | New bill, bills list, full-page bill details, A4 print/PDF and WhatsApp summary |
| Shared settings | Business details, appearance, backup and restore |

Remember the last screen. Support Light, Dark, and System appearance. Optimize for laptop use, keyboard navigation, and readable layouts. A second family member using another computer is a future requirement, not concurrent access in version one.

## 2. Project-Butterfly application

The design follows [Project-Butterfly](https://github.com/Immohanrajmuthu/Project-Butterfly), particularly its Constitution and UX, Design, and Architecture charters. The local copies in the sibling `Project-Butterfly` repository were reviewed. The customer-facing guidance is adapted to the shop operator's tasks.

| Principle | Concrete application |
| --- | --- |
| Purpose Before Code | Agree workflows and scope before rebuilding. |
| Confidence Before Completion | Review stock changes and bills; show save failures; make recovery dependable. |
| Calm is Beautiful | Restrained colors, clear labels, one main task per screen, quiet low-stock indicators. |
| Every Feature Must Earn Its Place | Defer offers, returns, tax, and multi-computer access. |
| Inclusion Before Compliance | Native accessible controls, visible focus, keyboard operation, readable contrast in both themes. |
| Every Module Tells One Story | Separate catalog, pricing, inventory, billing, publishing, and backup responsibilities. |
| Consistency Creates Confidence | Shared controls, predictable number formatting, identical calculations across preview/save/print. |

Interactive conversation previews establish the direction for products, the product editor, billing, bills, and stock workflows. They use sample data and are not production code or proof of completed implementation. Publishing, Settings, and the final invoice layout still need visual review during their implementation phases.

## 3. Product catalog and identity

- One parent product has one SKU, name, category, description, shared color choices, and one or more size entries.
- Clothing defaults to S, M, and L when creating a sized product. Labels can include age ranges; sizes can be added, reordered, or deactivated without losing history.
- Each size has its own stock, minimum-stock threshold, purchase cost, and selling price. The product list groups these separate size rows under the same SKU.
- A product without sizes has one inventory entry. Do not invent size/color choices that the catalog does not provide; defaults for newly created products are not evidence of imported variants.
- Colors are shared across sizes. Color is selected during billing but does not have its own stock balance or price.
- Use stable internal IDs for products and size entries. SKU and size labels are not database identity.
- Archive products rather than deleting history. Inactive sizes/products are unavailable for new sales.
- Optional desktop reference thumbnail: one per product, shared across sizes/colors. Add, replace, or remove in the editor; display in catalog and future billing search. Store a compressed local copy and include it in backup/restore. This supersedes the original no-desktop-photos decision. Website photos remain independently managed and are not overwritten by thumbnails.
- Categories initially include accessories and clothing.

### SKU allocation

Use one category-independent numeric sequence starting at 100000, stored as strings. Preserve existing accessory SKUs. Never reuse allocated SKUs, including archived products.

The agreed clothing migration is:

| Old SKU | New SKU | Product |
| --- | --- | --- |
| 200000 | 100089 | Lollipop & Ice-cream Printed Frock |
| 200001 | 100090 | ABC/Learning Print Full-sleeve Set |
| 200002 | 100091 | Puppy Print Jabla/Shorts Set |
| 200003 | 100092 | Star Print Knot Frock |

The expected next SKU is 100093. Verify actual identities and collisions against the catalog before migration. Retain the old SKU and website identity mapping. The owner will update website SKUs separately; publishing must not create duplicate listings during this transition.

## 4. Pricing

Manual selling-price entry is the primary workflow. An optional calculator assists with pricing for each size.

- Inputs: purchase cost, shipping, packaging, other expenses, and profit percentage.
- Support markup and margin; default to markup and explain the difference.
- Expenses can be entered per item or for a whole purchase, divided by the specified number of units.
- Applying the calculator changes the selling price and retains the private expense breakdown. Purchase cost remains a separate field.
- Receiving stock updates the purchase cost only for sizes with positive received quantities; it never silently changes selling prices.
- Use the latest entered purchase cost for future sales. This is an estimate when stock from different purchase costs is mixed, not FIFO or weighted-average accounting.
- Products or sizes priced at zero cannot be added to a bill. Show: **Set a selling price in Products & Pricing.**

For total unit cost `C` and percentage `p`: markup price is `C × (1 + p/100)`; margin price is `C / (1 - p/100)`. Margin must be below 100%. Allocate purchase expenses once, avoiding double counting with delivery expenses for the customer order.

Snapshot cost components and selling price on each saved invoice line. Later catalog edits must not change past invoices or their profit calculation.

Estimated bill profit = product subtotal after discount + delivery fee charged − snapshotted product costs (including allocated expenses) − actual delivery expense. Label unpaid bill profit as expected. Cancelled bills do not contribute to sales/profit totals.

Quantity offers and mixed-product offers belong to a later offers module. They will be optional by product/requirement, not a mandatory pricing field on every product. Version one uses manual bill discounts only.

## 5. Stock workflows

### Receive stock

Search by SKU or name and receive one product at a time, with all its sizes on one screen. Enter positive whole quantities and purchase cost per size. Show current stock and resulting stock, then review totals and cost changes before saving.

Zero-quantity rows remain entirely unchanged, including purchase cost. All size entries saved together share one operation ID and automatic saved timestamp. No receipt upload and no separately entered received date. The UI may call the operation a stock entry; it does not imply an uploaded supplier document.

### Adjust stock

Select a product and size, see current stock, enter actual quantity, and choose Count correction, Damaged, Missing, or Other. An optional note adds context. Review the delta before saving, for example `5 → 4, change −1`.

Require a non-negative whole actual quantity. An unchanged quantity does not create an adjustment. Corrections leave purchase cost and selling price unchanged and create an immutable history entry with the reason and saved timestamp.

### History and low stock

- History includes Received, Sold, Cancelled bill, and Adjustment.
- Show product/SKU, size, quantity change, stock after, source/reason, and saved date/time. Received entries include purchase cost.
- **Latest saved entries appear first**, across all change types. Use a deterministic sequence to resolve equal timestamps.
- Support product/SKU search and change-type filtering.
- Minimum-stock thresholds are per size. Use quiet counts and filters rather than interrupting popups.
- A draft does not reserve or deduct stock. Saving a paid or unpaid bill deducts once. Cancelling an unpaid bill restores once.

## 6. Billing

### Building a bill

Search by typing SKU or name. Arrow keys move through results; Enter selects; return focus to search after adding an item. A barcode scanner is not required for version one.

Require size and color when applicable; automatically select a sole option. Use the selected size's selling price and stock. Different size/color combinations remain separate invoice lines, but colors of the same size consume the same stock balance. Validate their combined quantity against that balance.

Support In person and WhatsApp sale channels, each with Pickup or Delivery. Delivery requires an address; pickup does not. Customer details are optional for a paid walk-in sale. An unpaid bill requires at least a name or phone number; WhatsApp sharing requires a phone number.

Payment status has two choices: Fully paid or Unpaid. Paid bills record Cash or UPI. No partial payments in version one.

Apply one manual bill-level discount, either amount or percentage, to the product subtotal only. Delivery charge defaults to zero and is not discounted. Record actual delivery expense separately for profit calculation.

`Total = product subtotal − discount + delivery charge`

Keep a single recoverable billing draft. Review the bill before saving. Revalidate stock and prices before final commitment; prevent accidental duplicate saving.

### Bill lifecycle

| Action | Outcome | Stock effect |
| --- | --- | --- |
| Save draft | Recoverable work in progress; no invoice number | None |
| Save fully paid | Paid invoice; Cash or UPI | Deduct once |
| Save unpaid | Unpaid invoice | Deduct once |
| Mark unpaid as paid | Same invoice; record payment mode and payment timestamp | None |
| Cancel unpaid | Keep invoice and number; require reason and cancellation timestamp | Restore once |

Paid-bill voiding, returns/refunds, and delivery tracking are deferred. A saved invoice is a historical snapshot; general editing of its financial lines is not part of this initial workflow.

Use `KC-000001` numbering, continuing across years. Record bill date separately from the saved timestamp. Never reuse numbers belonging to cancelled bills. The catalog-only rebuild starts with an empty bill set; any paper-numbering continuity constraint should be checked before live cutover.

### Bills list and invoice output

Search bills by invoice number, customer name, or phone. Offer date filters and All, Unpaid, Paid, and Cancelled status filters. Outstanding amount reflects all unpaid bills and is labeled clearly when the visible list has narrower filters. Open full-page invoice details for payment, cancellation, printing, and sharing.

A4 printing and PDF are included. Thermal receipt printing is a definite later requirement; invoice data must be independent of the A4 layout. WhatsApp prepares a text summary; the user sends it and attaches the PDF manually. The app does not silently send messages.

Header details, editable in Settings:

| Field | Value |
| --- | --- |
| Business name | Kutty Couture |
| Place | Kelambakkam, Chennai |
| Phone | 8610971628 |
| Website | kuttycouture.in |
| Instagram | @kuttycouture.in |
| Footer | Thank you for shopping with Kutty Couture! |

Include the business logo when configured, invoice number/date, product lines with size/color, discount, delivery charge, total, and payment status. Do not show a full business address, purchase costs, or profit. A customer's delivery address is a separate field.

## 7. Website publishing

The app owns catalog text, sizes, colors, and availability. The website owns photos. Publish one listing per SKU, not one listing per size.

- Public size availability is Available when stock is above zero and Unavailable when zero.
- A sized product is Available when at least one active size is available.
- A product without sizes uses its sole stock balance.
- No exact stock quantities, selling prices, purchase costs, expenses, profit, customer information, or billing information are published.
- No separate color availability: colors share the size stock balance.
- Manual **Publish changes** shows a preview of public changes. Maintain pending/published status and retry after a failed or offline attempt.
- Sales, receipts, corrections, and cancellations that change public availability mark publication as pending. The website remains at the last successful publication until the owner publishes again.
- Preserve website photos and website-owned fields during publication. Do not replace whole website records with private app records.

The connection/hosting/authentication method has not been selected. A validated public payload and preview can be built before that decision, but a real successful website update is required to call publishing complete.

## 8. Backup and recovery

- Automatically create a daily backup when the app is used; keep the latest 30 daily backups.
- Provide **Back up now** to a selected folder or USB drive.
- Include products, prices, stock history, bills, settings, and the data needed to restore identity/counters consistently.
- **Restore backup** shows the backup date and a review before replacing current data. Create a safety backup first.
- A backup elsewhere protects against laptop failure; a backup on the same laptop alone does not.

Technical recommendations: validate version/schema/integrity before restore, restore atomically, avoid pruning manual or safety backups as part of daily retention, and report backup failures visibly. Decide the exact automatic-backup location during Settings implementation.

## 9. Initial catalog-only migration

The owner chose a fresh operational start using only the product catalog. This supersedes proposals to carry over existing stock and bills.

1. Back up the existing active store before migration, including any custom storage location.
2. Validate the catalog snapshot (currently 93 products: 89 accessories and four clothing products).
3. Preserve catalog names, categories, descriptions, and supplied size/color metadata. Flag missing/ambiguous variants for review rather than inventing them.
4. Apply the clothing SKU mapping after collision checks and preserve website identity mappings.
5. Initialize every inventory entry with zero stock, zero purchase cost, and zero selling price.
6. Start with no bills, billing draft, or stock history. Do not fabricate stock receipts for the zero balances.
7. Initialize the confirmed business details and new settings; do not import unrelated legacy operating data.
8. Make migration restart-safe and verify counts and mappings before switching to the new store.

The owner enters actual stock and prices before billing. No real store has been reset by creating these documents.

## 10. Later versions

- Thermal receipt printing.
- Optional quantity offers and mixed-product offers; clear application and deliberate stacking rules.
- Another family member on a different computer, shared data, and a conflict strategy.
- Partial payments if needed, paid-bill voiding, and returns/refunds.
- Tax calculation and delivery/fulfilment tracking.
- Supplier/receipt documentation and advanced stock costing only if later required.

## 11. Decisions superseded during discussion

| Earlier idea | Final version-one decision |
| --- | --- |
| One combined quantity per product | Quantity per size; colors share that size quantity. |
| Separate clothing/accessory SKU sequences | One sequence; renumber the four clothing products only. |
| Separate physical received date | Automatic saved date/time only. |
| Carry over operating data | Catalog only; zero stock/cost/prices and no bills/history. |
| General multi-product pricing in initial release | Defer offers; manual bill discount only. |
| Multiple computers immediately | One laptop first. |

Ambiguous short approvals in the conversation are not evidence of additional features. Unresolved engineering details are listed explicitly in the implementation plan.
