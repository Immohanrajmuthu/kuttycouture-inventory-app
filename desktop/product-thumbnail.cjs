const { BrowserWindow, nativeImage, session } = require('electron');
const { randomUUID } = require('node:crypto');

async function productThumbnail(buffer) {
  if (buffer.length > 15 * 1024 * 1024) throw new Error('Choose an image smaller than 15 MB.');
  const webp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (webp) {
    // nativeImage does not decode WebP. Use Chromium's image decoder in an
    // isolated hidden window, with no preload, Node access or network access.
    const isolated = session.fromPartition(`thumbnail-${randomUUID()}`);
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    isolated.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('data:') }));
    const window = new BrowserWindow({ show: false, webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    let timer;
    try {
      const decode = async () => {
        await window.loadURL('data:text/html,' + encodeURIComponent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:">'));
        const result = await window.webContents.executeJavaScript(`(async () => {
          const image = new Image();
          image.src = ${JSON.stringify(`data:image/webp;base64,${buffer.toString('base64')}`)};
          await image.decode();
          if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('Image dimensions exceed limit');
          const scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext('2d');
          context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', 0.8);
        })()`);
        if (typeof result !== 'string' || !result.startsWith('data:image/jpeg;base64,') || Buffer.from(result.split(',')[1], 'base64').length > 80000) throw new Error('Invalid thumbnail');
        return result;
      };
      return await Promise.race([decode(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Decode timeout')), 15000); })]);
    } catch { throw new Error('This WebP image could not be opened. Choose another image or a smaller version.'); }
    finally { clearTimeout(timer); if (!window.isDestroyed()) window.destroy(); }
  }
  const original = nativeImage.createFromBuffer(buffer);
  if (original.isEmpty()) throw new Error('This image could not be opened. Choose a JPEG, PNG, or WebP image.');
  const { width, height } = original.getSize();
  const image = Math.max(width, height) > 320 ? original.resize(width >= height ? { width: 320 } : { height: 320 }) : original;
  const bytes = image.toJPEG(80);
  if (bytes.length > 80000) throw new Error('This image is too detailed for a thumbnail. Choose a smaller image.');
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}
module.exports = { productThumbnail };
