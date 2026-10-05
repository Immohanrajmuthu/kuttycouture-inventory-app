import catalog from "../data/websiteCatalog.json";
import { importWebsiteCatalog, WEBSITE_CATALOG_IMPORT } from "./importWebsiteCatalog";

test("imports every catalog SKU with searchable codes and no invented costs/prices", () => {
  const result = importWebsiteCatalog();
  expect(result.addedCount).toBe(93);
  expect(new Set(result.products.map((p) => p.id)).size).toBe(93);
  catalog.forEach((source, index) => {
    expect(result.products[index]).toMatchObject({
      name: source.name, sku: String(source.sku), barcode: String(source.sku),
      quantity: 0, price: 0, pricing: { single: 0 },
    });
  });
  expect(result.settings.categories).toEqual(["No Category", "accessories", "clothing"]);
});

test("preserves existing products and settings and skips numeric SKU or legacy barcode matches", () => {
  const products = [
    { id: 1, sku: catalog[0].sku, name: "Locally edited", quantity: 7, price: 25 },
    { id: 2, barcode: String(catalog[1].sku), quantity: 3 },
  ];
  const data = { products, settings: { shopName: "My shop", categories: ["Custom"] } };
  const before = JSON.stringify(data);
  const result = importWebsiteCatalog(data);
  expect(result.addedCount).toBe(91);
  expect(result.products.slice(0, 2)).toEqual(products);
  expect(result.settings.shopName).toBe("My shop");
  expect(result.settings.categories).toContain("Custom");
  expect(JSON.stringify(data)).toBe(before);
});

test("does not re-add deleted products or reset stock after the import completes", () => {
  const first = importWebsiteCatalog();
  first.products.pop();
  first.products[0].quantity = 0;
  const second = importWebsiteCatalog(first);
  expect(second.addedCount).toBe(0);
  expect(second.products).toBe(first.products);
  expect(second.products).toHaveLength(92);
  expect(second.products[0].quantity).toBe(0);
  expect(second.settings.websiteCatalogImport).toBe(WEBSITE_CATALOG_IMPORT);
});

test("initializes stock to zero and preserves catalog metadata", () => {
  const result = importWebsiteCatalog();
  expect(result.products.every((p) => p.quantity === 0)).toBe(true);
  expect(result.products[0].websiteCatalog.id).toBe(catalog[0].id);
});

test("partial import recovery skips deterministic IDs without overwriting records", () => {
  const existing = { id: `website-catalog:${catalog[0].sku}`, name: "Edited", quantity: 4 };
  const result = importWebsiteCatalog({ products: [existing] });
  expect(result.addedCount).toBe(92);
  expect(result.products[0]).toBe(existing);
});
