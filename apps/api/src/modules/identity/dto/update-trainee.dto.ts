import { Transform } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsEmail,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

/**
 * Edit User (PRD FR-DIR-05). The User ID is the primary key and never changes
 * (ADR 0003), so it is the route parameter, not a body field. The workspace,
 * the managing PM and the role are NOT accepted (stripped by the whitelist):
 * only the acting PM's own users can be edited.
 */
export class UpdateTraineeDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name: string;

    @Transform(trim)
    @IsEmail()
    @MaxLength(254)
    email: string;

    @IsIn(['FRONTEND', 'BACKEND', 'FULLSTACK', 'QA'])
    position: string;

    @IsIn(['PHYSICAL', 'ONLINE'])
    attendanceMode: string;

    @IsIn(['TRAINEE', 'CENTRAL_LND', 'INDUSTRIAL_ATTACHMENT', 'SBU'])
    resource: string;

    /** YYYY-MM-DD */
    @IsString()
    @MaxLength(10)
    onboardDate: string;

    /**
     * YYYY-MM-DD. May be empty only for a user who has no departure date yet.
     * An archived user must be given a date after today: that reactivates them.
     */
    @IsOptional()
    @IsString()
    @MaxLength(10)
    departureDate?: string;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(50)
    @IsString({ each: true })
    @MaxLength(64, { each: true })
    teamIds: string[];

    @IsInt()
    @Min(1)
    @Max(180)
    skillAssessmentMinutes: number;

    @IsInt()
    @Min(1)
    @Max(1000)
    skillAssessmentMarks: number;

    /**
     * Leave empty to keep the current password. A value resets it: the user must
     * change it at the next sign-in and every session of the user ends.
     */
    @IsOptional()
    @IsString()
    @MaxLength(128)
    temporaryPassword?: string;
}
