// Client-side image preparation before a Server Action upload (P0 fix 4).
//
// Why: a Server Action body is capped (next.config.ts →
// experimental.serverActions.bodySizeLimit = '4mb'; Vercel caps any function
// body at 4.5 MB) and phone photos are 2–8 MB. Before this, anything over the
// old 1 MB default died server-side with a bare 500 and the tenant saw nothing
// (VERIFICATION_REPORT §1.13). Downscaling on the device keeps every ordinary
// phone photo well under 1 MB; the server still re-encodes to 800×800 WebP
// with sharp (lib/r2/upload.ts), so this is a transport optimisation, never
// the source of truth.
//
// Browser-only: uses createImageBitmap / canvas. Import from client
// components only.

export const CLIENT_MAX_DIMENSION = 1600;
export const CLIENT_QUALITY = 0.85;
// Hard ceiling AFTER downscaling — leaves headroom under the 4 MB action body
// limit for the rest of the form. Anything larger is refused with a message
// instead of being sent to fail server-side.
export const CLIENT_MAX_BYTES = 3.5 * 1024 * 1024;

export const IMAGE_TOO_LARGE_MESSAGE =
  'الصورة كبيرة جداً حتى بعد التصغير (الحد ٣٫٥ ميغابايت) — جرّب صورة أخرى';

class ImageTooLargeError extends Error {
  constructor() {
    super(IMAGE_TOO_LARGE_MESSAGE);
    this.name = 'ImageTooLargeError';
  }
}

export function isImageTooLargeError(e: unknown): boolean {
  return e instanceof Error && e.name === 'ImageTooLargeError';
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation: 'from-image' applies EXIF rotation so a portrait
      // phone photo is not sent sideways. Older engines ignore the option.
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode failed'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Returns a File that is safe to put in a Server Action FormData:
 *  - non-images and GIFs (animated) pass through untouched, size-checked only;
 *  - everything else is downscaled to fit CLIENT_MAX_DIMENSION and re-encoded
 *    (WebP, falling back to JPEG where the canvas can't encode WebP);
 *  - if the result is still above CLIENT_MAX_BYTES an ImageTooLargeError is
 *    thrown (message is user-facing Arabic).
 * On any decode/encode failure the original file is returned (size-checked),
 * so an odd format never blocks an upload that the server could still handle.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  const passThrough = (f: File): File => {
    if (f.size > CLIENT_MAX_BYTES) throw new ImageTooLargeError();
    return f;
  };
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return passThrough(file);
  }

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    return passThrough(file);
  }
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!w || !h) return passThrough(file);

  const scale = Math.min(1, CLIENT_MAX_DIMENSION / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) return passThrough(file);
  ctx.drawImage(source, 0, 0, tw, th);
  if ('close' in source) source.close();

  let blob = await toBlob(canvas, 'image/webp', CLIENT_QUALITY);
  let ext = 'webp';
  if (!blob || blob.type !== 'image/webp') {
    blob = await toBlob(canvas, 'image/jpeg', CLIENT_QUALITY);
    ext = 'jpg';
  }
  if (!blob) return passThrough(file);

  // Never make things worse: a small, already-optimised upload stays as is.
  const candidate =
    blob.size < file.size
      ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: blob.type })
      : file;
  return passThrough(candidate);
}

// One user-facing message for any error THROWN by a Server Action (as opposed
// to a returned { ok: false }). Next only forwards an opaque digest for
// thrown errors in production, and the two realistic causes on an upload form
// are an oversized body and a dropped connection.
export const UPLOAD_FAILED_MESSAGE =
  'تعذّر الحفظ — الصورة كبيرة جداً أو انقطع الاتصال. جرّب صورة أصغر أو أعد المحاولة.';
