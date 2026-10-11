# Phase 5: A4 invoice, PDF and manual sharing

Implemented in the isolated redesign app. Thermal printing, website publishing and production cutover remain separate work.

## Public output model

`desktop/invoice-document.cjs` builds a new allowlisted object from the saved invoice. It includes business identity/logo/footer, invoice number/date, payment or cancellation status, customer details, delivery address only for delivery, product/SKU/size/color/quantity/selling-price lines, subtotal, discount, customer delivery charge, total and amount due. It excludes purchase costs, allocated shipping/packaging/other expenses, actual courier expense, profit, stock quantities, internal IDs and cancellation notes.

The HTML template escapes text, embeds only bounded JPEG data URLs, disables scripts and external content via CSP, repeats table headers on continued pages, avoids splitting item rows and totals, and includes A4 page numbers. A cancelled invoice clearly says no payment is due; its original totals remain visible for reference. Currency is INR. Print dates use Asia/Kolkata, while bill dates retain their saved calendar date.

## Desktop and UI

`desktop/invoice-output.cjs` resolves a saved invoice ID from authoritative storage. The renderer cannot submit arbitrary print HTML or filesystem paths. PDF/native print uses an isolated sandboxed BrowserWindow without a preload, with external requests and permissions denied. Both use the same HTML and A4 CSS. The output window closes after success, failure or cancellation. PDF is written via flushed temporary file and rename only after the native Save dialog chooses a destination, outside the active app data folder. The Save dialog defaults to Documents/Kutty Couture/Invoices (using the Windows Documents location, including redirection); users can choose another folder. Existing exports are not moved.

Invoice details offer Preview A4, Save PDF, Print A4, and Prepare WhatsApp. The embedded preview is a sandboxed script-free iframe showing the same document content; pagination is applied on PDF export/printing. Native printing is non-silent and opens the system print dialog. Cancellation is not reported as a successful print; successful submission is described as submission, not proof of paper output.

## Sharing

Preparing/reviewing a message has no external side effect. A recipient is required to open WhatsApp. Plain Indian 10-digit input receives +91; explicit international country codes are supported and validated. The recipient override does not modify the invoice. A separate Open WhatsApp click opens a fixed `https://wa.me/` destination with encoded text. The main process compares the reviewed text with the current invoice before opening. The user attaches the PDF and sends manually. Copy summary is also available. No PDF upload or automatic sending occurs.

## Branding and compatibility

Settings supports an optional logo using the existing bounded local JPEG picker. Logo is an optional preference and optional field in each new invoice's business snapshot. Existing invoices keep their saved branding, including no logo when originally absent. Backup/restore includes it. This is an additive schema-4 extension: the updated build reads older records; use this build to read backups containing logo fields. No database migration is needed.

## Validation and remaining check

Node tests cover public-field exclusion, HTML escaping, invoice status/amount due, historical branding, backup restore, phone normalization, fixed external URLs, PDF destination constraints, print cancellation/failure handling and output-window cleanup. Renderer tests cover sandboxed preview, saved invoice IDs, and explicit WhatsApp review/open separation.

The isolated Electron smoke generates real PDFs for paid, cancelled and a 40-line unpaid stress case, plus preview screenshots. Poppler renders the PDFs and pypdf checks A4 page geometry, page numbers, every item and the final total/footer. The long case spans eight pages with repeated headings and no clipped content. Tests do not send messages or submit physical print jobs. Test the actual printer and driver using Print A4 before relying on paper output in production.
