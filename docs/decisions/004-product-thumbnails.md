# Optional product thumbnails

Each product may have a `thumbnail` field containing a JPEG data URL, or null. Older records without the field remain valid. This is an additive schema-3 product extension; no database table migration is needed. Use the updated app to restore backups containing thumbnails; earlier app builds do not understand the field.

The main process opens a native JPEG/PNG picker, limits input to 15 MiB, decodes with Electron nativeImage, resizes to at most 320 pixels on the longest edge and encodes JPEG at quality 80 (maximum 80 KB). The renderer receives image data, never a filesystem path. Product validation restricts thumbnails to bounded JPEG data URLs. Images save atomically with the rest of the product and remain draft-only until Save product. Cancelling the picker preserves the previous image.

Embedding the small image in the local SQLite product JSON keeps backup and restore self-contained and avoids orphan image files. The backup limit is now 100 MiB; existing integrity checks and safety backups still apply. Original files and website images are untouched. Existing products initially have no thumbnail. Catalog rows display a 44-pixel reference; the editor displays a larger preview. Billing search thumbnails remain part of the upcoming billing implementation.
