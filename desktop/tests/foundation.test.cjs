const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { FoundationStore, parseBackup, developmentDirectory, validatePreferences, MAX_BACKUP_BYTES } = require('../foundation-store.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kutty-foundation-'));
  const store = new FoundationStore(directory);
  t.after(() => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return store;
}

test('development path stays in the repository and ignores the legacy pointer', () => {
  const directory = developmentDirectory(path.join(os.tmpdir(), 'example-project'));
  assert.equal(directory, path.join(os.tmpdir(), 'example-project', '.local', 'redesign'));
});

test('preferences persist across restarts; unknown fields and invalid choices are rejected', t => {
  const store = fixture(t);
  store.updatePreferences({ theme: 'dark', lastScreen: 'bills' });
  const second = new FoundationStore(store.directory);
  assert.equal(second.getPreferences().theme, 'dark');
  assert.equal(second.getPreferences().lastScreen, 'bills');
  second.close();
  for (const patch of [{ theme: 'blue' }, { lastScreen: '../' }, { shopName: '' }, { products: [] }, null, [], { place: 12 }]) {
    assert.throws(() => store.updatePreferences(patch));
  }
  assert.throws(() => validatePreferences(JSON.parse('{"__proto__":{}}'), true));
  assert.equal(store.getPreferences().theme, 'dark');
});

test('one transaction commits all writes or rolls back every write on failure', t => {
  const store = fixture(t);
  // Probe tables model future bill and stock writes without implementing their domain API.
  store.db.exec('CREATE TABLE probe_stock (quantity INTEGER); INSERT INTO probe_stock VALUES (5); CREATE TABLE probe_bills (number INTEGER UNIQUE);');
  assert.throws(() => store.transaction(() => {
    store.db.exec('UPDATE probe_stock SET quantity=4; INSERT INTO probe_bills VALUES (1);');
    throw new Error('Injected interruption');
  }));
  assert.equal(store.db.prepare('SELECT quantity FROM probe_stock').get().quantity, 5);
  assert.equal(store.db.prepare('SELECT count(*) AS count FROM probe_bills').get().count, 0);
  store.transaction(() => store.db.exec('UPDATE probe_stock SET quantity=4; INSERT INTO probe_bills VALUES (1);'));
  assert.equal(store.db.prepare('SELECT quantity FROM probe_stock').get().quantity, 4);
  assert.equal(store.db.prepare('SELECT count(*) AS count FROM probe_bills').get().count, 1);
  assert.throws(() => store.transaction(() => Promise.resolve()), /synchronous/);
});

test('abrupt process exit before commit leaves no partial stock or invoice writes', t => {
  const store = fixture(t);
  store.db.exec('CREATE TABLE probe_stock (quantity INTEGER); INSERT INTO probe_stock VALUES (5); CREATE TABLE probe_bills (number INTEGER);');
  const result = spawnSync(process.execPath, ['-e', `
    const {DatabaseSync}=require('node:sqlite');
    const db=new DatabaseSync(process.argv[1]);
    db.exec('BEGIN IMMEDIATE; UPDATE probe_stock SET quantity=0; INSERT INTO probe_bills VALUES (1);');
    process.exit(23);
  `, path.join(store.directory, 'foundation.sqlite')], { encoding: 'utf8' });
  assert.equal(result.status, 23, result.stderr);
  const reopened = new FoundationStore(store.directory);
  assert.equal(reopened.db.prepare('SELECT quantity FROM probe_stock').get().quantity, 5);
  assert.equal(reopened.db.prepare('SELECT count(*) AS count FROM probe_bills').get().count, 0);
  reopened.close();
});

test('backup restore replaces preferences and first preserves current settings', t => {
  const store = fixture(t);
  store.updatePreferences({ theme: 'dark' });
  const text = store.exportBackup();
  store.updatePreferences({ theme: 'light' });
  const restored = store.restoreBackup(text);
  assert.equal(restored.preferences.theme, 'dark');
  assert.equal(parseBackup(fs.readFileSync(restored.safetyPath, 'utf8')).preferences.theme, 'light');
  const destination = path.join(store.directory, 'manual.json');
  store.writeBackup(destination);
  assert.equal(parseBackup(fs.readFileSync(destination, 'utf8')).preferences.theme, 'dark');
  assert.equal(fs.readdirSync(store.directory).some(file => file.endsWith('.tmp')), false);
});

test('corrupt, incompatible, or oversized backups cannot change current settings', t => {
  const store = fixture(t);
  const before = store.getPreferences();
  const corrupt = JSON.parse(store.exportBackup());
  corrupt.payload.preferences.theme = 'dark';
  const incompatible = JSON.parse(store.exportBackup());
  incompatible.payload.schemaVersion = 99;
  for (const text of ['bad json', JSON.stringify(corrupt), JSON.stringify(incompatible), 'x'.repeat(MAX_BACKUP_BYTES + 1)]) {
    assert.throws(() => store.restoreBackup(text));
    assert.deepEqual(store.getPreferences(), before);
  }
});

test('failure to create safety backup aborts restore', t => {
  const store = fixture(t);
  const backup = store.exportBackup();
  store.updatePreferences({ theme: 'dark' });
  store.writeBackup = () => { throw new Error('Simulated disk full'); };
  assert.throws(() => store.restoreBackup(backup), /disk full/);
  assert.equal(store.getPreferences().theme, 'dark');
});
