import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

/** Body of POST /auth/email/verify/request: ask for a new verification link. */
export class RequestVerificationDto {
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsEmail()
    @IsNotEmpty()
    @MaxLength(254)
    email: string;
}
