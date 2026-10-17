const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Kept outside the database and backup payload. Plaintext never leaves main.
function publicationCredentials(directory, safeStorage) {
  const file = path.join(directory, 'github-publishing.enc');
  function supported() {
    return safeStorage.isEncryptionAvailable()
      && (!safeStorage.getSelectedStorageBackend || safeStorage.getSelectedStorageBackend() !== 'basic_text');
  }
  function status() { return { saved: fs.existsSync(file), encryptionAvailable: supported() }; }
  function save(token) {
    if (!supported()) throw new Error('Secure credential storage is unavailable on this computer.');
    if (typeof token !== 'string' || !/^[A-Za-z0-9_]{20,255}$/.test(token)) throw new Error('Enter a valid GitHub token.');
    const encrypted = safeStorage.encryptString(token);
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, encrypted, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    return status();
  }
  function read() {
    if (!supported() || !fs.existsSync(file)) throw new Error('Set up the GitHub publishing connection first.');
    try { return safeStorage.decryptString(fs.readFileSync(file)); }
    catch { throw new Error('The saved GitHub connection cannot be unlocked. Enter the token again.'); }
  }
  function remove() { if (fs.existsSync(file)) fs.unlinkSync(file); return status(); }
  return { status, save, read, remove };
}

module.exports = { publicationCredentials };
