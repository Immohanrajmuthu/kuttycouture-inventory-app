# Website publication — integration in progress

The owner confirmed on 11 October 2026 that GitHub `main` deploys kuttycouture.in through Netlify. The website currently compiles `src/data/products.ts` into its frontend. It is not yet consuming an app publication feed.

The owner chose to remember a repository-scoped GitHub token securely on this laptop. The development app now accepts the token in a password field and stores only Electron safeStorage ciphertext in `github-publishing.enc`, outside the SQLite database and its exported backups. No IPC endpoint returns the token. An unavailable encryption provider is rejected; the Linux plaintext backend is also rejected. Removing the local token does not revoke it on GitHub. Restoring a database backup does not replace this machine's connection. The Verify GitHub connection action now checks the fixed repository and main branch through authenticated read-only requests. It uses a 15-second timeout, refuses redirects, and returns sanitized errors. A successful read does not prove Contents write permission; that remains unverified until publication.

References: [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage), [GitHub repository contents API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents). The intended fine-grained token scope is only `Immohanrajmuthu/kuttycouture-website`, Contents read/write. Never put a real token in source, tests, logs, or chat.

## Implemented preview

`desktop/public-catalog.cjs` creates an explicit public allowlist. The narrow `publication:preview` command reads saved catalog data in main and returns a public snapshot, a deterministic SHA-256 version, and local review warnings. It does not access GitHub or change pending inventory markers.

Each product has its existing website identity (or stable `kc-<sku>` fallback for new products), current SKU, legacy SKU aliases, name, category/type, description, listed flag, shared active colors, active size labels with boolean availability, and overall boolean availability. Archived products are represented as unlisted and unavailable. Their final website handling is to be implemented in the adapter. Stock above zero on an active variant means available; private pricing does not influence website availability. App thumbnails and all financial/customer/billing fields are excluded.

The preview is a saved-data snapshot, not a diff against the live website. It requires an explicit refresh and labels the absence of a connection. Private price/cost edits and positive-to-positive stock changes do not alter its version; public metadata and availability changes do. The existing four clothing edits in the website checkout already match 100089–100092 and were left intact.

## Remaining before Phase 6 is complete

1. Add a validated website adapter for a versioned public JSON file. Match existing listings by website identity, retain website photos and descriptive metadata, support old clothing SKU links, handle new products without photos, and render per-size availability. Remove exact quantities from the shipped website data rather than merely hiding them in the UI.
2. Repository/branch read verification is implemented in the main process. Verify the real saved connection from the app; complete write-path validation with publication. Never return raw remote error bodies or credential-bearing errors to logs or UI.
3. Compare public snapshots with the deployed version, show a reviewed diff, and submit only the reviewed snapshot. GitHub file SHA guards concurrent updates. On an uncertain response, read the remote file before retrying to avoid duplicate commits.
4. Distinguish submitted-to-GitHub from deployed-to-Netlify. Verify the live public version before reporting publication success. Later catalog changes must remain pending relative to the acknowledged snapshot.
5. Demonstrate staging deployment, retained images, unavailable/available boundaries, offline failure/retry, and a sale during publication. No live catalog publication has occurred during this implementation.

The connection fields and local preview are not evidence of completed synchronization. Phase 6 remains open.
