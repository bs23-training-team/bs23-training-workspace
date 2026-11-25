
import {
    IsNotEmpty,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

export class ChangePasswordDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    currentPassword: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(8)
    @MaxLength(128)
    newPassword: string;

    /** Must equal `newPassword` (the API checks it, not only the screen). */
    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    confirmPassword: string;
}
