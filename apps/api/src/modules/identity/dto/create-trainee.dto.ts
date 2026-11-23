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
    MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

/**
 * Add Trainee (PRD FR-DIR-04). Every field is required except `resource`
 * (default TRAINEE). workspaceId, pmId and role are NOT accepted: the trainee
 * always joins the signed-in PM's workspace and is managed by that PM (unknown
 * fields are stripped by the ValidationPipe whitelist).
 */
export class CreateTraineeDto {
    /** Trainee ID, e.g. BS23001. Stored upper case. */
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(32)
    userId: string;

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name: string;

    @Transform(trim)
    @IsEmail()
    @MaxLength(254)
    email: string;

    /** Chosen by the PM; the trainee must change it at first sign-in. */
    @IsString()
    @MinLength(8)
    @MaxLength(128)
    temporaryPassword: string;

    @IsIn(['FRONTEND', 'BACKEND', 'FULLSTACK', 'QA'])
    position: string;

    @IsIn(['PHYSICAL', 'ONLINE'])
    attendanceMode: string;

    /** YYYY-MM-DD */
    @IsString()
    @MaxLength(10)
    onboardDate: string;

    /** YYYY-MM-DD, after the onboarding date. */
    @IsString()
    @MaxLength(10)
    departureDate: string;

    /** Default TRAINEE. */
    @IsOptional()
    @IsIn(['TRAINEE', 'CENTRAL_LND', 'INDUSTRIAL_ATTACHMENT', 'SBU'])
    resource?: string;

    /** One or more of the acting PM's own teams. */
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
}
