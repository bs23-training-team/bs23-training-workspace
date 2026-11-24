import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FeedbackVersionItem } from '@bs23/contracts';
import { FeedbackService } from './feedback.service.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { Roles } from '../identity/decorators/access.decorators.js';
import { requirePm, type RequestWithUser } from './directory.actor.js';

/** HTTP only: read the request, call the service. The rules are in FeedbackService. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PM')
@Controller('directory/users/:userId/feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  save(
    @Param('userId') userId: string,
    @Req() req: RequestWithUser,
    @Body() body: { text?: unknown } | undefined,
  ): Promise<FeedbackVersionItem> {
    const text = typeof body?.text === 'string' ? body.text : '';
    return this.feedback.saveFeedback(requirePm(req), userId, text);
  }
}
