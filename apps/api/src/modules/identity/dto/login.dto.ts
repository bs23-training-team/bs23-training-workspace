import { Transform } from 'class-transformer';
import {
    IsBoolean,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

export class LoginDto {
    /** PM: registered email (looked up in Pm). Trainee: assigned Trainee ID (User.userId). */
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @IsNotEmpty()
    @MaxLength(254)
    identifier: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(8)
    @MaxLength(128)
    password: string;

    /** FR-AUTH-01: "remember me" gives a longer session (Session.remembered). */
    @IsOptional()
    @IsBoolean()
    rememberMe?: boolean;
}
