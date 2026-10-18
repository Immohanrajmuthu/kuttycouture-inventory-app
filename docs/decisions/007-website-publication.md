# Website publication — integration in progress

The owner confirmed on 11 October 2026 that GitHub `main` deploys kuttycouture.in through Netlify. The website currently compiles `src/data/products.ts` into its frontend. It is not yet consuming an app publication feed.

The owner chose to remember a repository-scoped GitHub token securely on this laptop. The development app now accepts the token in a password field and stores only Electron safeStorage ciphertext in `github-publishing.enc`, outside the SQLite database and its exported backups. No IPC endpoint returns the token. An unavailable encryption provider is rejected; the Linux plaintext backend is also rejected. Removing the local token does not revoke it on GitHub. Restoring a database backup does not replace this machine's connection. The Verify GitHub connection action now checks the fixed repository and main branch through authenticated read-only requests. It uses a 15-second timeout, refuses redirects, and returns sanitized errors. A successful read does not prove Contents write permission; that remains unverified until publication.

References: [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage), [GitHub repository contents API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents). The intended fine-grained token scope is only `Immohanrajmuthu/kuttycouture-website`, Contents read/write. Never put a real token in source, tests, logs, or chat.

## Implemented preview

`desktop/public-catalog.cjs` creates an explicit public allowlist. The narrow `publication:preview` command reads saved catalog data in main and returns a public snapshot, a deterministic SHA-256 version, and local review warnings. It does not access GitHub or change pending inventory markers.

Each product has its existing website identity (or stable `kc-<sku>` fallback for new products), current SKU, legacy SKU aliases, name, category/type, description, listed flag, shared active colors, active size labels with boolean availability, and overall boolean availability. Archived products are represented as unlisted and unavailable. Their final website handling is to be implemented in the adapter. Stock above zero on an active variant means available; private pricing does not influence website availability. App thumbnails and all financial/customer/billing fields are excluded.

The preview is a saved-data snapshot, not a diff against the live website. It requires an explicit refresh and labels the absence of a connection. Private price/cost edits and positive-to-positive stock changes do not alter its version; public metadata and availability changes do. The existing four clothing edits in the website checkout already match 100089–100092 and were left intact.

## Publisher implemented on 17 October 2026

The app now has Review website changes, explicit Publish reviewed catalog to website, and Check deployment. Main retains the reviewed snapshot and a 15-minute token. A changed app snapshot or remote file requires another review. GitHub file SHA checks prevent overwrites; retry reads the remote version before sending another commit. A sale during submission stays pending relative to the live snapshot. Preview and submission compare against GitHub; deployment status compares against the live public JSON. Neither a successful commit nor an offline cached confirmation is reported as a current live deployment.

Only the fixed repository, main branch, and public/catalog-publication.json path can be written. Tokens never go to the website host. Requests reject redirects and use bounded response sizes, timeouts, and sanitized errors. The public file is limited to 900 KB. Public-only last-confirmed version and timestamp are saved in publication-status.json outside database backups; this advisory cache is reconstructed from live checks and does not alter catalog or stock data. Existing stock availability markers are retained as historical hints; authoritative pending changes are computed against the live catalog, including metadata edits and changes after restoration.

The website adapter is applied locally to the website develop checkout. It retains images by identity, handles missing photos, supports legacy SKU routes, removes exact quantities, keeps prices null, and shows per-size availability. The initial null publication preserves the current listing set until the first explicit publication. See [integration and release instructions](../../integration/website/README.md).

## Remaining release evidence

- Review/merge the eight website integration files to main and confirm the initial Netlify deployment.
- Verify the owner's real token and Contents write permission through the first reviewed publication.
- Demonstrate an actual staging/deployed update, retained photos, offline retry, and pending edits during deployment. Local mock tests do not establish live synchronization.

No catalog or source-code deployment was performed during implementation. Phase 6 remains open until end-to-end deployment evidence is collected.
First-publication safeguard: review now states explicitly that app stock availability replaces website availability, shows resulting Available/Unavailable totals, and recommends cancelling until stock review is complete. An unchecked acknowledgement blocks publishing; main also rejects missing/nonboolean confirmation for an initial remote catalog. Starting a new review resets the acknowledgement. No publication or deployment is authorized by adding this safeguard.
