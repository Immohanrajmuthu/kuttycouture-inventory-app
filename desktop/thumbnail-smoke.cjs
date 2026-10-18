const assert = require('node:assert/strict');
const { nativeImage } = require('electron');
const { productThumbnail } = require('./product-thumbnail.cjs');
module.exports = async window => {
  const webp = await window.webContents.executeJavaScript(`(() => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 400;
    const context = canvas.getContext('2d'); context.fillStyle = '#d05060'; context.fillRect(100, 100, 200, 200);
    return canvas.toDataURL('image/webp');
  })()`);
  assert.ok(webp.startsWith('data:image/webp;base64,'));
  const jpeg = await productThumbnail(Buffer.from(webp.split(',')[1], 'base64'));
  const image = nativeImage.createFromDataURL(jpeg);
  assert.deepEqual(image.getSize(), { width: 320, height: 200 });
  assert.ok(Buffer.from(jpeg.split(',')[1], 'base64').length <= 80000);
  for (const buffer of [image.toPNG(), image.toJPEG(80)]) assert.ok((await productThumbnail(buffer)).startsWith('data:image/jpeg;base64,'));
  await assert.rejects(productThumbnail(Buffer.from('RIFF0000WEBPinvalid')), /WebP image could not be opened/);
  await assert.rejects(productThumbnail(Buffer.alloc(15 * 1024 * 1024 + 1)), /smaller than 15 MB/);
  console.log('Thumbnail smoke passed: WebP decode/resize, PNG/JPEG compatibility, invalid and oversized input.');
};
