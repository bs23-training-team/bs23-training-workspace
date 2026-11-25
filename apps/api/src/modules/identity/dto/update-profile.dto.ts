import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

/**
 * Profile of the signed-in account (PRD US34: display name and bio). The
 * account is ALWAYS the one in `req.user`; an id sent in the body is stripped.
 * `bio` may be empty to clear it.
 */
export class UpdateProfileDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty({ message: 'Display name cannot be empty.' })
    @MaxLength(120)
    name: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(1000)
    bio?: string;
}
