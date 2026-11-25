import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthRole } from './account.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';
import { detectPhotoType, photoProblem } from './photo.js';
import { ProfilePhotoStorage } from './profile-photo.storage.js';

const MIME_BY_EXT: Record<string, string> = {
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
};

/**
 * The signed-in account's own profile: display name, bio and photo (PRD US34).
 *
 * Every method takes the account from `req.user` (role + id) and touches only
 * that one row. The role decides the table (PM -> `Pm`, any User role ->
 * `User`); nothing here accepts an account id from the request.
 */
@Injectable()
export class ProfileService {
    constructor(
        @Inject(PrismaService) private readonly prisma: PrismaService,
        @Inject(ProfilePhotoStorage) private readonly storage: ProfilePhotoStorage,
    ) { }

    private async currentPhotoPath(role: AuthRole, id: string): Promise<string | null> {
        const row =
            role === 'PM'
                ? await this.prisma.pm.findUnique({ where: { pmId: id }, select: { photoPath: true } })
                : await this.prisma.user.findUnique({ where: { userId: id }, select: { photoPath: true } });

        if (!row) {
            throw new NotFoundException('Account not found.');
        }

        return row.photoPath;
    }

    private setPhotoPath(role: AuthRole, id: string, photoPath: string | null) {
        return role === 'PM'
            ? this.prisma.pm.update({ where: { pmId: id }, data: { photoPath } })
            : this.prisma.user.update({ where: { userId: id }, data: { photoPath } });
    }

    async updateProfile(role: AuthRole, id: string, dto: UpdateProfileDto) {
        const data = { name: dto.name, bio: dto.bio ?? '' };

        const updated =
            role === 'PM'
                ? await this.prisma.pm.update({ where: { pmId: id }, data, select: { name: true, bio: true } })
                : await this.prisma.user.update({ where: { userId: id }, data, select: { name: true, bio: true } });

        return { message: 'Profile updated.', user: { id, name: updated.name, bio: updated.bio ?? '' } };
    }

    async setPhoto(role: AuthRole, id: string, file: { buffer?: Uint8Array } | undefined) {
        const problem = photoProblem(file?.buffer);

        if (problem || !file?.buffer) {
            throw new BadRequestException(problem ?? 'Choose a JPG, PNG or WebP image under 2 MB.');
        }

        // The type comes from the bytes themselves, never from the claimed Content-Type.
        const type = detectPhotoType(file.buffer);

        if (!type) {
            throw new BadRequestException('Choose a JPG, PNG or WebP image under 2 MB.');
        }

        const previous = await this.currentPhotoPath(role, id);
        const photoPath = this.storage.pathFor(id, type.ext);

        await this.storage.save(photoPath, file.buffer);
        await this.setPhotoPath(role, id, photoPath);

        // A new file type (png -> jpg) has a different name: do not leave the old file behind.
        if (previous && previous !== photoPath) {
            await this.storage.remove(previous);
        }

        return { message: 'Photo updated.', hasPhoto: true };
    }

    async getPhoto(role: AuthRole, id: string): Promise<{ bytes: Buffer; mime: string }> {
        const photoPath = await this.currentPhotoPath(role, id);
        const bytes = photoPath ? await this.storage.read(photoPath) : null;

        if (!photoPath || !bytes) {
            throw new NotFoundException('No profile photo.');
        }

        const ext = photoPath.split('.').pop() ?? '';

        return { bytes, mime: MIME_BY_EXT[ext] ?? 'application/octet-stream' };
    }

    async removePhoto(role: AuthRole, id: string) {
        const photoPath = await this.currentPhotoPath(role, id);

        if (photoPath) {
            await this.setPhotoPath(role, id, null);
            await this.storage.remove(photoPath);
        }

        return { message: 'Photo removed.', hasPhoto: false };
    }
}
