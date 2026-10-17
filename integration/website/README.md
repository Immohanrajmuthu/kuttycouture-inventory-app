# Website publishing integration

Prepared against the owner's website checkout on 17 October 2026. The eight integration files have been applied locally on its `develop` branch; no commit, push or deployment was performed. Existing clothing SKU edits were retained. The unrelated invoice PDF was left untouched.

The website needs these files deployed together before the desktop publisher can operate:

- `public/catalog-publication.json` (initial null publication retains the existing catalog)
- `public/product-placeholder.svg`
- `src/data/published-catalog.ts`
- `src/data/products.ts`
- `src/types/product.ts`
- `src/components/products/ProductDetails.tsx`
- `src/components/products/ProductDetailPage.tsx`
- `src/utils/productAvailability.ts`

The `prepare.cjs` helper transforms a matching, unintegrated source checkout into a separate staging copy and records SHA-256 hashes of every original file. `apply.cjs` checks all hashes before applying that prepared set. Do not rerun preparation against an already integrated checkout. These helpers do not run Git commands or publish anything. The adapter source alongside them is copied to `src/data/published-catalog.ts` in the website.

The adapter uses website identities to retain photos and website-only descriptive metadata. Public quantities are removed from the source catalog, prices remain null, and availability labels are Available/Unavailable. After first publication, the public JSON determines the listing set; absent or archived products are hidden. New products get a placeholder until website photos are added to a matching ID in the base catalog. Old clothing SKU links resolve through published legacy aliases.

## Release checks

1. Review these eight files in the website repository; exclude unrelated files, especially the invoice PDF. Merge the integration through the website's normal review process to `main` and confirm its Netlify deployment.
2. The initial JSON has null payload/version, so deploying integration alone does not replace website availability with the app's opening zero stock.
3. In the desktop app, verify GitHub, then Review website changes. Confirm availability and incomplete size/color warnings before choosing Publish reviewed catalog to website.
4. Check deployment until the app confirms the submitted version is live. Review product pages, old clothing links, images, size statuses, hidden archives, and a new product without photos.
5. Simulate a subsequent availability change while deploying and confirm it remains pending. Test failure/retry against a staging deployment before calling Phase 6 complete.

Local evidence: adapter unit tests, TypeScript checks and Vite production build in `.local/website-integration`. Automated publisher tests use mocked GitHub/website responses; they are not evidence of an actual Netlify deployment. The desktop limits the public file to 900 KB to stay within the GitHub contents API's Base64 read limit.
