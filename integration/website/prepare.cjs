// Prepare a reviewable website change set without writing to the website checkout.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const source = path.resolve(process.argv[2]);
const target = path.resolve(process.argv[3]);
if (source === target) throw new Error('Use a separate staging directory.');
const files = {};
const read = file => fs.readFileSync(path.join(source, file), 'utf8');
function replace(text, from, to) { if (!text.includes(from)) throw new Error(`Website source changed: missing ${from}`); return text.replace(from, to); }
let catalog = read('src/data/products.ts');
catalog = 'import publication from "../../public/catalog-publication.json";\nimport { applyPublication } from "./published-catalog";\n' + catalog;
catalog = replace(catalog, 'export const products: Product[] = [', 'const websiteProducts: Product[] = [');
catalog = catalog.replace(/^\s*stockCount: \d+,\r?\n/gm, '\n').replace(/price: (?:\d+(?:\.\d+)?|null),/g, 'price: null,').replace(/availability: "low-stock"/g, 'availability: "in-stock"');
catalog = replace(catalog, 'export default products;', 'export const products = applyPublication(websiteProducts, publication);\nexport default products;');
files['src/data/products.ts'] = catalog;
let types = read('src/types/product.ts');
types = replace(types, '  stockCount: number;', '  legacySkus?: string[];\n  sizeAvailability?: { label: string; available: boolean }[];');
types = types.replace(/  \/\/ Internal inventory information\.[\s\S]*?  legacySkus/, '  legacySkus');
files['src/types/product.ts'] = types;
files['src/components/products/ProductDetails.tsx'] = replace(read('src/components/products/ProductDetails.tsx'), 'product.sizes?.filter(Boolean).join(", ")', 'product.sizeAvailability?.map(size => `${size.label}: ${size.available ? "Available" : "Unavailable"}`).join(", ") ?? product.sizes?.filter(Boolean).join(", ")');
files['src/components/products/ProductDetailPage.tsx'] = replace(read('src/components/products/ProductDetailPage.tsx'), 'product.sku === sku', 'product.sku === sku || product.legacySkus?.includes(String(sku))');
files['src/utils/productAvailability.ts'] = read('src/utils/productAvailability.ts').replace('Limited Availability', 'Available').replace('Currently Unavailable', 'Unavailable');
files['src/data/published-catalog.ts'] = fs.readFileSync(path.join(__dirname, 'published-catalog.ts'), 'utf8');
for (const file of ['catalog-publication.json', 'product-placeholder.svg']) files[`public/${file}`] = fs.readFileSync(path.join(__dirname, file), 'utf8');
const manifest = [];
for (const [file, text] of Object.entries(files)) {
  const original = path.join(source, file);
  manifest.push({ file, before: fs.existsSync(original) ? createHash('sha256').update(fs.readFileSync(original)).digest('hex') : null });
  fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
  fs.writeFileSync(path.join(target, file), text);
}
fs.writeFileSync(path.join(target, 'integration-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Prepared ${manifest.length} website files in ${target}`);
