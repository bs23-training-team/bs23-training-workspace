import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body of POST /auth/email/verify and /auth/email/verify/resend. */
export class VerifyEmailDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(256)
    token: string;
}
