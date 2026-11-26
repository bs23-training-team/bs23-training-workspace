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
    Req,
    UseGuards,
    ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RateLimitGuard } from './guards/rate-limit.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { AccountProvisioningService } from './account-provisioning.service.js';
import { AllowMustChangePassword, Roles } from './decorators/access.decorators.js';
import { RateLimit } from './decorators/rate-limit.decorator.js';
import type { AuthenticatedRequest } from './types.js';
import { IdentityService } from './identity.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { RequestVerificationDto } from './dto/request-verification.dto.js';
import { CreatePmDto } from './dto/create-pm.dto.js';
import { CreateTraineeDto } from './dto/create-trainee.dto.js';

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
 * PM through the PM Dashboard's Add PM / Add Trainee workflows
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

    // ----- Email verification (public, the emailed token is the credential) --

    @Post('email/verify')
    @HttpCode(200)
    @UseGuards(RateLimitGuard)
    @RateLimit('email-verify')
    verifyEmail(@Body(validation(VerifyEmailDto)) dto: VerifyEmailDto) {
        return this.identityService.verifyEmail(dto);
    }

    // A PM who never received the link asks for a new one by email address.
    // The answer is always the same (no account enumeration).
    @Post('email/verify/request')
    @HttpCode(200)
    @UseGuards(RateLimitGuard)
    @RateLimit('email-verify-request')
    requestVerification(@Body(validation(RequestVerificationDto)) dto: RequestVerificationDto) {
        return this.identityService.requestVerification(dto);
    }

    @Post('email/verify/resend')
    @HttpCode(200)
    @UseGuards(RateLimitGuard)
    @RateLimit('email-verify')
    resendVerification(@Body(validation(VerifyEmailDto)) dto: VerifyEmailDto) {
        return this.identityService.resendVerification(dto);
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
