import websiteCatalog from "../data/websiteCatalog.json";
import { normalizeAppSettings } from "./appSettings";

export const WEBSITE_CATALOG_IMPORT = "kutty-couture-catalog-v1";

const productCode = (value) => String(value ?? "").trim().toLowerCase();

// An additive, one-time snapshot import. Never refresh stock/prices from the
// website on startup: inventory becomes the source of truth after import.
export const importWebsiteCatalog = (data = {}) => {
  const products = data.products || [];
  const settings = normalizeAppSettings(data.settings);
  if (settings.websiteCatalogImport === WEBSITE_CATALOG_IMPORT) {
    return { products, settings, addedCount: 0 };
  }

  const existingCodes = new Set(
    products.flatMap((product) => [productCode(product.sku), productCode(product.barcode)])
      .filter(Boolean),
  );
  const existingIds = new Set(products.map((product) => String(product.id)));
  const additions = websiteCatalog.filter((product) =>
    !existingCodes.has(productCode(product.sku)) &&
    !existingIds.has(`website-catalog:${product.sku}`),
  ).map((product) => ({
    id: `website-catalog:${product.sku}`,
    name: product.name,
    sku: String(product.sku),
    barcode: String(product.sku),
    category: product.category,
    quantity: 0, // Physical inventory must be entered independently of the website.
    price: 0, // The catalog has no purchase costs.
    minStock: 0,
    pricing: { single: product.price ?? 0, packs: {} },
    websiteCatalog: {
      id: product.id,
      productType: product.productType,
      description: product.shortDescription,
      sizes: product.sizes || [],
      color: product.color || "",
      availability: product.availability,
    },
  }));

  return {
    products: [...products, ...additions],
    settings: {
      ...settings,
      categories: [...new Set([
        ...(settings.categories || []),
        ...websiteCatalog.map((product) => product.category),
      ])],
      websiteCatalogImport: WEBSITE_CATALOG_IMPORT,
    },
    addedCount: additions.length,
  };
};
