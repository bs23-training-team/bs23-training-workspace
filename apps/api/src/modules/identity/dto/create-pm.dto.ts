import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

/**
 * Add PM (PRD FR-DIR-09): name, email, PM ID, password. All four are
 * required. The workspace is NEVER taken from the body: a new PM is always
 * created in the signed-in PM's own workspace (unknown fields such as
 * workspaceId / role are stripped by the ValidationPipe whitelist).
 */
export class CreatePmDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name: string;

    @Transform(trim)
    @IsEmail()
    @MaxLength(254)
    email: string;

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(32)
    pmId: string;

    @IsString()
    @MinLength(8)
    @MaxLength(128)
    password: string;
}
