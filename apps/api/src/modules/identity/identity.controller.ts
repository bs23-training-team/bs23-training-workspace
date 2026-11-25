import {
    Body,
    Controller,
    Delete,
    Get,
    Headers,
    HttpCode,
    Inject,
    Param,
    ParseUUIDPipe,
    Post,
    Patch,
    Put,
    Req,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors,
    ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RateLimitGuard } from './guards/rate-limit.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { AccountProvisioningService } from './account-provisioning.service.js';
import { AllowMustChangePassword, Roles } from './decorators/access.decorators.js';
import { RateLimit } from './decorators/rate-limit.decorator.js';
import type { AuthenticatedRequest } from './types.js';
import { IdentityService } from './identity.service.js';
import { ProfileService } from './profile.service.js';
import { PHOTO_MAX_BYTES } from './photo.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { CreatePmDto } from './dto/create-pm.dto.js';
import { CreateTraineeDto } from './dto/create-trainee.dto.js';
import { UpdateTraineeDto } from './dto/update-trainee.dto.js';

// `expectedType` makes validation independent of emitted decorator metadata
// (a test runner such as Vitest does not emit it), so the same DTO rules apply
// in the real build and in the route-level tests.
const validation = (expectedType: new () => object) =>
    new ValidationPipe({
        whitelist: true,
        transform: true,
        expectedType,
    });

/**
 * E01 authentication API (routes follow the E01 SRS section 5).
 *
 * There is NO public PM sign-up. Accounts are created only by a signed-in,
 * verified PM through the PM Dashboard's Add PM / Add Trainee workflows
 * (POST /auth/accounts/*), which are guarded by JwtAuthGuard + RolesGuard and
 * re-checked in AccountProvisioningService. The very first PM is created by an
 * operator command (cli/provision-initial-pm.ts).
 */
@Controller('auth')
export class IdentityController {
    constructor(
        @Inject(IdentityService) private readonly identityService: IdentityService,
        @Inject(AccountProvisioningService)
        private readonly provisioning: AccountProvisioningService,
        @Inject(ProfileService) private readonly profile: ProfileService,
    ) { }

    // One login endpoint for both roles. `identifier` is the registered email
    // for a PM (looked up in Pm) or the assigned Trainee ID for a user (looked
    // up in User.userId). The role comes from the table the account is in.
    @Post('login')
    @HttpCode(200)
    @UseGuards(RateLimitGuard)
    @RateLimit('login', 'login-ip')
    login(
        @Body(validation(LoginDto)) dto: LoginDto,
        @Headers('user-agent') userAgent?: string,
    ) {
        return this.identityService.login(dto, userAgent);
    }

    @Post('refresh')
    @HttpCode(200)
    @UseGuards(RateLimitGuard)
    @RateLimit('refresh')
    refresh(@Body(validation(RefreshDto)) dto: RefreshDto) {
        return this.identityService.refresh(dto.refreshToken);
    }

    // ----- Password recovery (public) ---------------------------------

    @Post('password/forgot')
    @HttpCode(200)
    @UseGuards(RateLimitGuard)
    @RateLimit('password-forgot', 'password-forgot-ip')
    forgotPassword(@Body(validation(ForgotPasswordDto)) dto: ForgotPasswordDto) {
        return this.identityService.forgotPassword(dto);
    }

    @Post('password/reset')
    @HttpCode(200)
    @UseGuards(RateLimitGuard)
    @RateLimit('password-reset')
    resetPassword(@Body(validation(ResetPasswordDto)) dto: ResetPasswordDto) {
        return this.identityService.resetPassword(dto);
    }

    // ----- PM Dashboard: Add PM / Add Trainee (PM only) ---------------------
    // The actor is ALWAYS taken from the verified access token (`req.user`),
    // never from the body.

    @Post('accounts/pms')
    @UseGuards(RateLimitGuard, JwtAuthGuard, RolesGuard)
    @RateLimit('account-provision')
    @Roles('PM')
    createPm(@Body(validation(CreatePmDto)) dto: CreatePmDto, @Req() req: AuthenticatedRequest) {
        return this.provisioning.createPm(req.user, dto);
    }

    @Post('accounts/trainees')
    @UseGuards(RateLimitGuard, JwtAuthGuard, RolesGuard)
    @RateLimit('account-provision')
    @Roles('PM')
    createTrainee(@Body(validation(CreateTraineeDto)) dto: CreateTraineeDto, @Req() req: AuthenticatedRequest) {
        return this.provisioning.createTrainee(req.user, dto);
    }

    // Edit User (FR-DIR-05): read the saved values, then save. PM only, only the PM's own users.
    @Get('accounts/trainees/:userId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('PM')
    getTrainee(@Param('userId') userId: string, @Req() req: AuthenticatedRequest) {
        return this.provisioning.getTrainee(req.user, userId);
    }

    @Patch('accounts/trainees/:userId')
    @UseGuards(RateLimitGuard, JwtAuthGuard, RolesGuard)
    @RateLimit('account-provision')
    @Roles('PM')
    updateTrainee(
        @Param('userId') userId: string,
        @Body(validation(UpdateTraineeDto)) dto: UpdateTraineeDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.provisioning.updateTrainee(req.user, userId, dto);
    }

    // Retry of the "account created" email (the credentials dialog's Retry button).
    @Post('accounts/:accountId/resend-email')
    @HttpCode(200)
    @UseGuards(RateLimitGuard, JwtAuthGuard, RolesGuard)
    @RateLimit('account-provision')
    @Roles('PM')
    resendAccountEmail(@Param('accountId') accountId: string, @Req() req: AuthenticatedRequest) {
        return this.provisioning.resendAccountEmail(req.user, accountId);
    }

    // ----- Signed-in account -------------------------------------------

    @UseGuards(JwtAuthGuard)
    @AllowMustChangePassword()
    @Post('logout')
    @HttpCode(200)
    logout(@Req() req: AuthenticatedRequest) {
        return this.identityService.logout(req.user.sid);
    }

    @UseGuards(JwtAuthGuard)
    @AllowMustChangePassword()
    @Get('me')
    me(@Req() req: AuthenticatedRequest) {
        return this.identityService.me(req.user.role, req.user.sub);
    }

    // ----- Own profile: name, bio, photo (PRD US34). Always the caller's own row. -----

    @UseGuards(JwtAuthGuard)
    @Patch('me/profile')
    updateProfile(
        @Body(validation(UpdateProfileDto)) dto: UpdateProfileDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.profile.updateProfile(req.user.role, req.user.sub, dto);
    }

    // multipart/form-data with one file field named "photo". The 2 MB limit is enforced while
    // the upload is read; the file type is decided from its bytes in ProfileService.
    @UseGuards(JwtAuthGuard)
    @Put('me/photo')
    @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: PHOTO_MAX_BYTES, files: 1 } }))
    setPhoto(
        @UploadedFile() file: { buffer?: Uint8Array } | undefined,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.profile.setPhoto(req.user.role, req.user.sub, file);
    }

    @UseGuards(JwtAuthGuard)
    @Get('me/photo')
    async getPhoto(@Req() req: AuthenticatedRequest, @Res() res: Response) {
        const { bytes, mime } = await this.profile.getPhoto(req.user.role, req.user.sub);
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(bytes);
    }

    @UseGuards(JwtAuthGuard)
    @Delete('me/photo')
    removePhoto(@Req() req: AuthenticatedRequest) {
        return this.profile.removePhoto(req.user.role, req.user.sub);
    }

    // Change Password (also completes the mandatory first-login change)
    @UseGuards(JwtAuthGuard)
    @AllowMustChangePassword()
    @Post('password/change')
    @HttpCode(200)
    changePassword(
        @Body(validation(ChangePasswordDto)) dto: ChangePasswordDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.identityService.changePassword(
            req.user.role,
            req.user.sub,
            req.user.workspaceId,
            req.user.sid,
            dto,
        );
    }

    // ----- Sessions ---------------------------------------------------

    @UseGuards(JwtAuthGuard)
    @AllowMustChangePassword()
    @Get('sessions')
    listSessions(@Req() req: AuthenticatedRequest) {
        return this.identityService.listSessions(
            req.user.role,
            req.user.sub,
            req.user.sid,
        );
    }

    @UseGuards(JwtAuthGuard)
    @AllowMustChangePassword()
    @Delete('sessions/:sessionId')
    revokeSession(
        @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.identityService.revokeSession(
            req.user.role,
            req.user.sub,
            req.user.workspaceId,
            sessionId,
        );
    }
}
