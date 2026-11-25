import { PHOTO_MAX_BYTES, PHOTO_PROBLEM, detectPhotoType, photoProblem } from './photo.js';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const TEXT = new TextEncoder().encode('<script>alert(1)</script>');

describe('profile photo type (decided from the bytes, never from the name)', () => {
    it('recognises JPEG, PNG and WebP', () => {
        expect(detectPhotoType(JPEG)).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
        expect(detectPhotoType(PNG)).toEqual({ mime: 'image/png', ext: 'png' });
        expect(detectPhotoType(WEBP)).toEqual({ mime: 'image/webp', ext: 'webp' });
    });

    it('refuses anything else, including a renamed script, GIF, SVG and an empty file', () => {
        expect(detectPhotoType(TEXT)).toBeNull();
        expect(detectPhotoType(new TextEncoder().encode('GIF89a......'))).toBeNull();
        expect(detectPhotoType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
        expect(detectPhotoType(new Uint8Array())).toBeNull();
        // RIFF but not WEBP (a WAV file)
        expect(detectPhotoType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
    });
});

describe('profile photo problems (JPG, PNG or WebP, at most 2 MB)', () => {
    it('accepts a valid image up to the size limit', () => {
        expect(photoProblem(JPEG)).toBeNull();
        const atLimit = new Uint8Array(PHOTO_MAX_BYTES);
        atLimit.set(PNG);
        expect(photoProblem(atLimit)).toBeNull();
    });

    it('refuses missing, empty, oversized and wrong-type uploads with the same message', () => {
        const tooBig = new Uint8Array(PHOTO_MAX_BYTES + 1);
        tooBig.set(PNG);

        for (const bad of [undefined, null, new Uint8Array(), tooBig, TEXT]) {
            expect(photoProblem(bad)).toBe(PHOTO_PROBLEM);
        }
    });
});
