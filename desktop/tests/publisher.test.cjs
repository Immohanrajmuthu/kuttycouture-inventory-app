const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publisher } = require('../publisher.cjs');
const { importCatalog } = require('../catalog.cjs');
const source = require('../../src/data/websiteCatalog.json');
function fixture() {
  const products = importCatalog(source).products;
  let remote = { format: 'kutty-couture-publication-v1', version: null, payload: null };
  let live = structuredClone(remote); let sha = 'a'.repeat(40); let puts = 0; let fault = false; let during;
  const service = publisher({ credentials: { read: () => 'SECRET_TOKEN' }, products: () => products, fetchRequest: async (url, options) => {
    assert.equal(options.redirect, 'error');
    if (url.startsWith('https://kuttycouture.in/')) { assert.equal(options.headers, undefined); return Response.json(live); }
    assert.equal(options.headers.Authorization, 'Bearer SECRET_TOKEN');
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body); assert.equal(body.sha, sha); assert.equal(body.branch, 'main');
      remote = JSON.parse(Buffer.from(body.content, 'base64').toString()); sha = 'b'.repeat(40); puts++;
      if (during) during();
      if (fault) { fault = false; throw new Error('SECRET_TOKEN'); }
      return Response.json({ commit: { sha } });
    }
    return Response.json({ type: 'file', encoding: 'base64', sha, content: Buffer.from(JSON.stringify(remote)).toString('base64') });
  } });
  return { service, products, puts: () => puts, deploy: () => { live = structuredClone(remote); }, fault: () => { fault = true; }, concurrent: () => { sha = 'c'.repeat(40); }, during: fn => { during = fn; } };
}
test('reviewed publication sends only public data and distinguishes submitted from deployed', async () => {
  const f = fixture(); const review = await f.service.prepare();
  assert.equal((await f.service.status()).state, 'ready');
  assert.equal(review.changes.length, 93); assert.equal(review.firstPublication, true);
  await assert.rejects(f.service.publish('unknown'), /Review website changes/);
  const submitted = await f.service.publish(review.reviewToken);
  assert.equal(submitted.state, 'submitted'); assert.equal(f.puts(), 1);
  assert.equal((await f.service.status()).state, 'waiting');
  f.deploy(); const status = await f.service.status();
  assert.equal(status.state, 'live'); assert.equal(status.pendingChanges, 0);
  f.products[0].name += ' changed';
  assert.equal((await f.service.status()).pendingChanges, 1);
});
test('uncertain write retry reads GitHub and never duplicates a received commit', async () => {
  const f = fixture(); const review = await f.service.prepare(); f.fault();
  await assert.rejects(f.service.publish(review.reviewToken), /Connection interrupted/);
  await f.service.publish(review.reviewToken);
  assert.equal(f.puts(), 1);
});
test('stale app or remote changes require a new review; changes during submission remain pending', async () => {
  const f = fixture(); let review = await f.service.prepare();
  f.products[0].name += ' changed';
  await assert.rejects(f.service.publish(review.reviewToken), /Products changed/);
  review = await f.service.prepare(); f.concurrent();
  await assert.rejects(f.service.publish(review.reviewToken), /website changed/);
  review = await f.service.prepare();
  f.during(() => { f.products[0].variants[0].stock = 1; });
  assert.equal((await f.service.publish(review.reviewToken)).pendingNewChanges, true);
  f.deploy(); assert.equal((await f.service.status()).pendingChanges, 1);
});
test('missing website integration cannot create a catalog file or publish', async () => {
  let count = 0;
  const service = publisher({ credentials: { read: () => 'secret' }, products: () => [], fetchRequest: async () => { count++; return new Response('', { status: 404 }); } });
  await assert.rejects(service.prepare(), /setup is not installed/);
  await assert.rejects(service.publish('fake'), /Review website changes/);
  assert.equal(count, 1);
});

test('offline status retains the previous confirmation without claiming the current site is live', async () => {
  const previous = { version: 'a'.repeat(64), checkedAt: '2026-10-17T10:00:00Z' };
  const service = publisher({ credentials: { read: () => 'secret' }, products: () => [], history: { read: () => previous, write: () => assert.fail('Offline must not write success') }, fetchRequest: async () => { throw new Error('secret'); } });
  const result = await service.status();
  assert.equal(result.state, 'unconfirmed'); assert.deepEqual(result.lastConfirmed, previous);
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});
