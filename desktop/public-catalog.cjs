const { createHash } = require('node:crypto');

// Build from an explicit allowlist; never serialize a private catalog record.
function publicCatalog(products) {
  const listings = products.map(product => {
    const active = product.variants.filter(variant => variant.active);
    return {
      id: product.websiteId || `kc-${product.sku}`,
      sku: product.sku,
      legacySkus: [...product.legacySkus].sort(),
      name: product.name,
      category: product.category,
      productType: product.productType,
      description: product.description,
      listed: !product.archived,
      colors: product.colors.filter(color => color.active).map(color => color.label),
      sizes: product.hasSizes ? active.map(variant => ({
        label: variant.label, available: !product.archived && variant.stock > 0,
      })) : [],
      available: !product.archived && active.some(variant => variant.stock > 0),
    };
  }).sort((left, right) => left.sku.localeCompare(right.sku, 'en', { numeric: true }));
  for (const key of ['id', 'sku']) {
    if (new Set(listings.map(product => product[key])).size !== listings.length) {
      throw new Error(`Duplicate website ${key}. Resolve product identities before publishing.`);
    }
  }
  return { schemaVersion: 1, products: listings };
}

function publicationPreview(products) {
  const payload = publicCatalog(products);
  return {
    payload,
    version: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    review: products.filter(product => !product.archived && product.review.length)
      .map(product => ({ sku: product.sku, fields: [...product.review] })),
  };
}

module.exports = { publicCatalog, publicationPreview };
