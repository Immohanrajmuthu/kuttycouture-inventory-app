# Phase 4: Billing and invoice lifecycle

Implemented in the isolated redesign workspace. Production cutover is still pending.

## Responsibilities

- `src/redesign/domain/billing.js`: shared draft validation, totals, sale eligibility, revision checks and combined stock validation across colors.
- `desktop/billing-store.cjs`: invoice snapshots, validated lifecycle commands, billing backup validation and stock writes within FoundationStore transactions.
- `src/redesign/BillingPage.js`: keyboard product search, selection, cart, draft, review, invoice history and payment/cancellation confirmation.
- Named IPC: billing load, save draft, save invoice, pay invoice, cancel invoice. The main process is authoritative.

## Persistence

Schema 4 adds a singleton JSON billing state in SQLite containing the invoice counter, one draft/revision, bills and an idempotency journal. This deliberately simple local model has a 10,000-invoice limit; indexed per-invoice storage/pagination is a future scalability improvement. No legacy invoices are imported. Upgrading an existing schema-3 store first writes a safety backup.

Saving an invoice, allocating its number, deducting stock, inserting stock operations/movements, recording the operation ID, marking availability changes and clearing the draft commit together. Paying an unpaid bill changes only payment state; cancelling an unpaid bill restores stock in the same transaction as cancellation. Each product gets one stock operation and each size one aggregate movement, regardless of color splits. Stock history links actions by invoice number. Receipt/correction history continues to work unchanged.

Invoice numbers start KC-000001 and continue across years. Restore retains the highest existing counter even when restoring older data. Retrying the same command ID and payload returns the existing result; conflicting reuse is rejected. Product revisions and draft revisions reject stale saves. Failures retain review input and the command ID for retry.

## Draft and money behavior

Use **Save draft** to persist unfinished work; this version does not autosave every keystroke. Unsaved navigation/closing uses the existing discard guard. Drafts have no invoice number and no stock effect. Reload saved draft and Clear draft are explicit actions. Final stock/prices are revalidated on Save invoice, including all colors sharing the selected size's balance. A zero price blocks billing. Refresh prices and stock updates the cart for a new review.

All money is integer paise. Percentage discounts use basis points and half-up rounding, applied only to product subtotal. Delivery charge is added afterwards. Unit purchase cost and all three expense components are snapshotted; profit estimate equals discounted revenue plus delivery charge minus costs and actual delivery expense. Customer details, channel/handover, bill date and business profile are snapshots too. Unpaid requires name or phone; delivery requires an address. Paid walk-ins can omit customer details.

## Recovery and limits

Schema-4 backups include draft, invoices, lifecycle operations and stock links. Validation checks totals, identities/counters, lifecycle state, stock directions, invoice linkage and ledger balances. Older schema-1 backups restore settings only. Schema-2/3 catalog restores clear billing/draft but retain the invoice high-water mark. Safety copies are made first. Thumbnails remain private catalog data; invoice snapshots do not duplicate them.

A4/PDF and prepared WhatsApp messages are Phase 5. Phone validation for WhatsApp sharing will apply there. No tax, partial payments, paid-bill voiding, returns, offers, delivery tracking or multiple-computer sync is introduced.

## Verification

Storage tests cover aggregate color stock, paid/unpaid transitions, retries, stale/invalid data, immutable costs/prices, draft restart, multi-product cancellation, write rollback, process interruption, schema migration, tampered backups and restore counters. Renderer tests cover keyboard/sole-option selection, draft recovery, customer validation, failed-save retry and zero pricing. Hidden Electron checks exercise a real isolated store, draft reload, unpaid sale, cancellation, payment, themes, compact width and screenshots.
