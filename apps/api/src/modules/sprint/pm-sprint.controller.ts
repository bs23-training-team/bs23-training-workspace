import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { Roles } from '../identity/decorators/access.decorators.js';
import { sprintValidation } from './dto/base.dto.js';
import { OwnerReplyDto } from './dto/pm-sprint.dto.js';
import { CurrentActor, SprintHttp } from './http/actor.guard.js';
import { PmSprintService } from './pm-sprint.service.js';
import type { SprintActor } from './http/actor.js';
import type { SprintTaskView } from './dto/sprint-response.dto.js';

/**
 * The PM-side sprint API (SRS 5.4).
 *
 * Every route runs `SprintHttp()`, which is E01's `JwtAuthGuard` (it checks the token and sets
 * `req.user`), then the sprint actor guard (it turns `req.user` into the caller, 401 when
 * there is nobody), then E01's `RolesGuard` (403 for the wrong role).
 *
 * The controller is thin: it validates the input, takes the caller off the request, and calls
 * the service. It never reads a header, and it never takes a `pmId` from the client — the
 * PM is whoever signed in (PRD EP-14).
 *
 * The PM's own scope is decided in the service, against the rows: a PM may only act on the
 * users they manage (PRD BR-08).
 */
@Controller('pm/sprint')
@SprintHttp()
@Roles('PM')
export class PmSprintController {
  constructor(private readonly sprint: PmSprintService) {}

  /**
   * P7 — record the owner's answer to a task.
   *
   * The answer is recorded **once**: a second attempt answers 409 `ALREADY_DECIDED`. A task
   * of somebody else's user answers 403 `FORBIDDEN_SCOPE`.
   */
  @Post('tasks/:id/owner-reply')
  @HttpCode(200)
  recordOwnerReply(
    @CurrentActor() actor: SprintActor,
    @Param('id') id: string,
    @Body(sprintValidation(OwnerReplyDto)) body: OwnerReplyDto,
  ): Promise<SprintTaskView> {
    return this.sprint.recordOwnerReply(actor, id, body.decision);
  }
}
