const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
function publicationHistory(directory) {
  const file = path.join(directory, 'publication-status.json');
  return {
    read() {
      try {
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (/^[a-f0-9]{64}$/.test(value.version) && typeof value.checkedAt === 'string' && Number.isFinite(Date.parse(value.checkedAt))) return { version: value.version, checkedAt: value.checkedAt };
      } catch { /* Cache is advisory. Live checks remain authoritative. */ }
      return null;
    },
    write(value) {
      const temporary = `${file}.${randomUUID()}.tmp`;
      try { fs.writeFileSync(temporary, JSON.stringify(value), { flag: 'wx' }); fs.renameSync(temporary, file); }
      finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    },
  };
}
module.exports = { publicationHistory };
