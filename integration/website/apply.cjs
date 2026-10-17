const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const stage = path.resolve(process.argv[2]);
const target = path.resolve(process.argv[3]);
const manifest = JSON.parse(fs.readFileSync(path.join(stage, 'integration-manifest.json'), 'utf8'));
for (const entry of manifest) {
  const destination = path.resolve(target, entry.file);
  if (!destination.startsWith(target + path.sep) || !path.resolve(stage, entry.file).startsWith(stage + path.sep)) throw new Error('Invalid integration path');
  const before = fs.existsSync(destination) ? createHash('sha256').update(fs.readFileSync(destination)).digest('hex') : null;
  if (before !== entry.before) throw new Error(`Website changed since preparation: ${entry.file}. Re-prepare before applying.`);
}
for (const entry of manifest) {
  const destination = path.resolve(target, entry.file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(stage, entry.file), destination);
}
console.log(`Applied ${manifest.length} reviewed integration files. No Git commits or deployments performed.`);
