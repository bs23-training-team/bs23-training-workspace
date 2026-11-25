import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

/**
 * Where profile photos are kept. The shared schema only stores a path
 * (`photoPath`: "storage path only; storage provider not decided yet"), so
 * this class is the one place that knows the provider. Today it is a local
 * folder (UPLOAD_DIR, default "uploads" next to the API). Swapping in an
 * approved object store later means replacing this class; nothing else in
 * the identity module changes.
 *
 * Paths handed in and out are RELATIVE to the upload folder, and every file
 * name is built from a cleaned account id, so a request can never reach
 * outside the folder.
 */
@Injectable()
export class ProfilePhotoStorage {
    constructor(private readonly config: ConfigService) { }

    private root(): string {
        return resolve(this.config.get<string>('UPLOAD_DIR') ?? process.env.UPLOAD_DIR ?? 'uploads');
    }

    /** "profile-photos/PM001.png" for an account id and an extension. */
    pathFor(accountId: string, ext: string): string {
        const safeId = accountId.replace(/[^A-Za-z0-9_-]/g, '_');

        return `profile-photos/${safeId}.${ext}`;
    }

    private absolute(relativePath: string): string {
        // Only a plain "profile-photos/<file>" shape is ever resolved.
        return join(this.root(), 'profile-photos', basename(relativePath));
    }

    async save(relativePath: string, bytes: Uint8Array): Promise<void> {
        await mkdir(join(this.root(), 'profile-photos'), { recursive: true });
        await writeFile(this.absolute(relativePath), bytes);
    }

    async read(relativePath: string): Promise<Buffer | null> {
        try {
            return await readFile(this.absolute(relativePath));
        } catch {
            return null;
        }
    }

    async remove(relativePath: string): Promise<void> {
        await rm(this.absolute(relativePath), { force: true });
    }
}
