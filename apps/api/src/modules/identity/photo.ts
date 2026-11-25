/**
 * Profile photo rules (PRD US34): JPG, PNG or WebP, at most 2 MB.
 *
 * Pure functions (no Nest, no disk) so they are easy to unit test. The kind of
 * image is decided from the file's own first bytes, never from the file name
 * or the Content-Type the caller claims, so a renamed script cannot pass.
 */

export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export type PhotoType = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; ext: 'jpg' | 'png' | 'webp' };

export const PHOTO_PROBLEM = 'Choose a JPG, PNG or WebP image under 2 MB.';

/** The image type of these bytes, or null when they are not a JPEG, PNG or WebP. */
export function detectPhotoType(bytes: Uint8Array): PhotoType | null {
    const at = (i: number) => bytes[i];

    if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
        return { mime: 'image/jpeg', ext: 'jpg' };
    }

    if (
        bytes.length >= 8 &&
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i) === b)
    ) {
        return { mime: 'image/png', ext: 'png' };
    }

    // WebP: "RIFF" <4 size bytes> "WEBP"
    if (
        bytes.length >= 12 &&
        [0x52, 0x49, 0x46, 0x46].every((b, i) => at(i) === b) &&
        [0x57, 0x45, 0x42, 0x50].every((b, i) => at(8 + i) === b)
    ) {
        return { mime: 'image/webp', ext: 'webp' };
    }

    return null;
}

/** The problem with this upload, or null when it is acceptable. */
export function photoProblem(bytes: Uint8Array | undefined | null): string | null {
    if (!bytes || bytes.length === 0 || bytes.length > PHOTO_MAX_BYTES) {
        return PHOTO_PROBLEM;
    }

    return detectPhotoType(bytes) ? null : PHOTO_PROBLEM;
}
