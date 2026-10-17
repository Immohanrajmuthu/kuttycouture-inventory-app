import type { Product } from '../types/product';

type Listing = {
  id: string; sku: string; legacySkus: string[]; name: string;
  category: 'accessories' | 'clothing'; productType: string; description: string;
  listed: boolean; colors: string[]; sizes: { label: string; available: boolean }[]; available: boolean;
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid public catalog object');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value))) throw new Error('Unexpected public catalog fields');
}
function text(value: unknown, max: number) { return typeof value === 'string' && value.length <= max; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.length <= 50 && value.every(item => text(item, 200)); }
export function applyPublication(base: Product[], input: unknown): Product[] {
  const document = object(input);
  exact(document, ['format', 'version', 'payload']);
  if (document.format !== 'kutty-couture-publication-v1') throw new Error('Unsupported public catalog');
  if (document.version === null && document.payload === null) return base;
  if (typeof document.version !== 'string' || !/^[a-f0-9]{64}$/.test(document.version)) throw new Error('Invalid catalog version');
  const payload = object(document.payload);
  exact(payload, ['schemaVersion', 'products']);
  if (payload.schemaVersion !== 1 || !Array.isArray(payload.products) || payload.products.length > 10000) throw new Error('Invalid public catalog');
  const ids = new Set<string>(); const skus = new Set<string>();
  const listings = payload.products.map(value => {
    const p = object(value);
    exact(p, ['id', 'sku', 'legacySkus', 'name', 'category', 'productType', 'description', 'listed', 'colors', 'sizes', 'available']);
    if (!text(p.id, 200) || !p.id || !text(p.name, 200) || !p.name || !text(p.description, 3000) || !text(p.productType, 100)
      || typeof p.sku !== 'string' || !/^\d{6,9}$/.test(p.sku) || !strings(p.legacySkus) || p.legacySkus.some(sku => !/^\d{6,9}$/.test(sku))
      || !strings(p.colors) || !['accessories', 'clothing'].includes(String(p.category)) || typeof p.listed !== 'boolean'
      || typeof p.available !== 'boolean' || !Array.isArray(p.sizes) || p.sizes.length > 50) throw new Error('Invalid public product');
    for (const value of p.sizes) {
      const size = object(value); exact(size, ['label', 'available']);
      if (!text(size.label, 100) || typeof size.available !== 'boolean') throw new Error('Invalid public size');
    }
    const listing = p as unknown as Listing;
    if (ids.has(listing.id) || skus.has(listing.sku)) throw new Error('Duplicate public identity');
    ids.add(listing.id); skus.add(listing.sku);
    return listing;
  });
  const originals = new Map(base.map(product => [product.id, product]));
  return listings.filter(p => p.listed).map(p => {
    const original = originals.get(p.id);
    return {
      ...original,
      id: p.id, sku: Number(p.sku), legacySkus: p.legacySkus,
      name: p.name, category: p.category, productType: p.productType as Product['productType'],
      shortDescription: p.description, color: p.colors.join(', '), sizes: p.sizes.map(size => size.label),
      sizeAvailability: p.sizes, availability: p.available ? 'in-stock' : 'out-of-stock',
      price: null, offerAvailable: original?.offerAvailable ?? false,
      images: original?.images.length ? original.images : [{ src: '/product-placeholder.svg', alt: 'Product photo coming soon' }],
    };
  });
}
