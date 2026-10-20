/**
 * Client-side avatar downscaling, ported from `resizeImage` in
 * static/js/contestant_lobby.js.
 *
 * Worth keeping: phone camera images are several megabytes and the avatar
 * renders at a couple of hundred pixels, on a LAN where upload bandwidth is
 * shared with everyone else joining at once.
 */

const VALID_TYPES = [
  "image/apng",
  "image/gif",
  "image/jpeg",
  "image/pjpeg",
  "image/png",
  "image/webp",
];

export function isValidImageType(file: File): boolean {
  return VALID_TYPES.includes(file.type);
}

/** Centre-crops to a square of `size` and re-encodes as webp. */
export async function resizeImage(file: File, size: number): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const ratio = Math.max(size / width, size / height);
  const x = (size - width * ratio) / 2;
  const y = (size - height * ratio) / 2;

  ctx.drawImage(bitmap, 0, 0, width, height, x, y, width * ratio, height * ratio);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ? new File([blob], file.name, { type: "image/webp" }) : file),
      "image/webp",
      1,
    );
  });
}
